/*
 * @license
 * Copyright (c) 2019. OOO Nata-Info
 * @author Andrei Sarakeev <avs@nata-info.ru>
 *
 * This file is part of the "@nata" project.
 * For the full copyright and license information, please view
 * the EULA file that was distributed with this source code.
 */

import debugFactory from 'debug';
import { EventEmitter } from 'events';
import _ from 'lodash';
import { Socket } from 'net';
import fs from 'fs';
import Address, { AddressParam, AddressType } from '../Address';
import { Client, IPortArg } from '../ipc';
import { devices, IDevice, toInt } from '../mib';
import { getMibFile, IMibDeviceType } from '../mib/devices';
import { NibusConnection } from '../nibus';
import { createNmsRead } from '../nms';
import SarpDatagram from '../sarp/SarpDatagram';
import { PATH } from './common';
import { Category } from './KnownPorts';

const debug = debugFactory('nibus:session');
const noop = () => {};
export const delay = (seconds: number) =>
  new Promise(resolve => setTimeout(resolve, seconds * 1000));

export type FoundListener =
  (arg: { connection: NibusConnection, category: Category, address: Address }) => void;

export type ConnectionListener = (connection: NibusConnection) => void;
export type DeviceListener = (device: IDevice) => void;

declare interface NibusSession {
  on(event: 'start' | 'close', listener: Function): this;
  on(event: 'found', listener: FoundListener): this;
  on(event: 'add' | 'remove', listener: ConnectionListener): this;
  on(event: 'connected' | 'disconnected', listener: DeviceListener): this;
  on(event: 'pureConnection', listener: (connection: NibusConnection) => void): this;
  once(event: 'start' | 'close', listener: Function): this;
  once(event: 'found', listener: FoundListener): this;
  once(event: 'add' | 'remove', listener: ConnectionListener): this;
  once(event: 'connected' | 'disconnected', listener: DeviceListener): this;
  once(event: 'pureConnection', listener: (connection: NibusConnection) => void): this;
  off(event: 'start' | 'close', listener: Function): this;
  off(event: 'found', listener: FoundListener): this;
  off(event: 'add' | 'remove', listener: ConnectionListener): this;
  off(event: 'connected' | 'disconnected', listener: DeviceListener): this;
  off(event: 'pureConnection', listener: (connection: NibusConnection) => void): this;
  removeListener(event: 'start' | 'close', listener: Function): this;
  removeListener(event: 'found', listener: FoundListener): this;
  removeListener(event: 'add' | 'remove', listener: ConnectionListener): this;
  removeListener(event: 'connected' | 'disconnected', listener: DeviceListener): this;
  removeListener(event: 'pureConnection', listener: (connection: NibusConnection) => void): this;
}

class NibusSession extends EventEmitter {
  private readonly connections: NibusConnection[] = [];
  private isStarted = false;
  private socket?: Socket; // = Client.connect(PATH);

  private reloadHandler = (ports: IPortArg[]) => {
    const prev = this.connections.splice(0, this.connections.length);
    ports.forEach((port) => {
      const { portInfo: { comName } } = port;
      const index = _.findIndex(prev, { path: comName });
      if (index !== -1) {
        this.connections.push(prev.splice(index, 1)[0]);
      } else {
        this.addHandler(port);
      }
    });
    prev.forEach(connection => this.closeConnection(connection));
  };

  private addHandler = async ({ portInfo: { comName }, description }: IPortArg) => {
    debug('add');
    const connection = new NibusConnection(comName, description);
    this.connections.push(connection);
    this.emit('add', connection);
    if (process.platform === 'win32') await delay(2);
    this.find(connection);
    devices.get()
      .filter(device => device.connection == null)
      .reduce(async (promise, device) => {
        await promise;
        debug('start ping');
        const time = await connection.ping(device.address);
        debug(`ping ${time}`);
        if (time !== -1) {
          device.connection = connection;
          /**
           * New connected device
           * @event NibusSession#connected
           * @type IDevice
           */
          this.emit('connected', device);
          // device.emit('connected');
          debug(`mib-device ${device.address} was connected`);
        }
      }, Promise.resolve())
      .catch(noop);
  };

  private closeConnection(connection: NibusConnection) {
    connection.close();
    devices.get()
      .filter(device => device.connection === connection)
      .forEach((device) => {
        device.connection = undefined;
        this.emit('disconnected', device);
        debug(`mib-device ${connection.path}#${device.address} was disconnected`);
      });
    this.emit('remove', connection);
  }

  private removeHandler = ({ portInfo: { comName } }: IPortArg) => {
    const index = this.connections.findIndex(({ path }) => comName === path);
    if (index !== -1) {
      const [connection] = this.connections.splice(index, 1);
      this.closeConnection(connection);
    }
  };

  private find(connection: NibusConnection) {
    const { description } = connection;
    const descriptions = Array.isArray(description.select) ? description.select : [description];
    const baseCategory = Array.isArray(description.select) ? description.category : null;
    descriptions.forEach((descr) => {
      const { category } = descr;
      switch (descr.find) {
        case 'sarp': {
          let { type } = descr;
          if (type === undefined) {
            const mib = JSON.parse(fs.readFileSync(getMibFile(descr.mib!)).toString());
            const { types } = mib;
            const device = types[mib.device] as IMibDeviceType;
            type = toInt(device.appinfo.device_type);
          }
          connection.once('sarp', (sarpDatagram: SarpDatagram) => {
            if (baseCategory && connection.description.category !== baseCategory) return;
            if (baseCategory && connection.description.category === baseCategory) {
              debug(`category was changed: ${connection.description.category} => ${category}`);
              connection.description = descr;
            }
            const address = new Address(sarpDatagram.mac);
            debug(`device ${category}[${address}] was found on ${connection.path}`);
            this.emit(
              'found',
              {
                connection,
                category,
                address,
              },
            );
          });
          connection.findByType(type).catch(noop);
          break;
        }
        case 'version':
          connection.sendDatagram(createNmsRead(Address.empty, 2))
            .then((datagram) => {
              if (!datagram || Array.isArray(datagram)) return;
              if (connection.description.category === 'ftdi') {
                debug(`category was changed: ${connection.description.category} => ${category}`);
                connection.description = descr;
              }
              const address = new Address(datagram.source.mac);
              this.emit(
                'found',
                {
                  connection,
                  category,
                  address,
                },
              );
              debug(`device ${category}[${address}] was found on ${connection.path}`);
            }, noop);
          break;
        default:
          this.emit('pureConnection', connection);
          break;
      }
    });
  }

  // public async start(watch = true) {
  //   if (this.isStarted) return;
  //   const { detection } = detector;
  //   if (detection == null) throw new Error('detection is N/A');
  //   detector.on('add', this.addHandler);
  //   detector.on('remove', this.removeHandler);
  //   await detector.getPorts();
  //
  //   if (watch) detector.start();
  //   this.isStarted = true;
  //   process.once('SIGINT', () => this.stop());
  //   process.once('SIGTERM', () => this.stop());
  //   /**
  //    * @event NibusService#start
  //    */
  //   this.emit('start');
  //   debug('started');
  // }
  //
  start() {
    return new Promise<number>((resolve, reject) => {
      if (this.isStarted) return resolve(this.connections.length);
      this.isStarted = true;
      this.socket = Client.connect(PATH);
      this.socket.once('error', (error) => {
        console.error('error while start nibus.service', error.message);
        this.close();
        reject(error);
      });
      this.socket.on('ports', this.reloadHandler);
      this.socket.on('add', this.addHandler);
      this.socket.on('remove', this.removeHandler);
      this.socket.once('ports', (ports) => {
        resolve(ports.length);
        this.emit('start');
      });
      this.socket.once('close', () => this.close());
    });
  }

  // tslint:disable-next-line:function-name
  _connectDevice(device: IDevice, connection: NibusConnection) {
    if (device.connection === connection) return;
    device.connection = connection;
    const event = connection ? 'connected' : 'disconnected';
    process.nextTick(() => this.emit(event, device));
    // device.emit('connected');
    debug(`mib-device [${device.address}] was ${event}`);
  }

  public close() {
    if (!this.isStarted) return;
    this.isStarted = false;
    debug('close');
    /**
     * @event NibusSession#close
     */
    this.emit('close');
    // detector.stop();
    this.connections
      .splice(0, this.connections.length)
      .forEach(connection => this.closeConnection(connection));
    this.socket && this.socket.destroy();
    // this.removeAllListeners();
  }

  //
  async pingDevice(device: IDevice): Promise<number> {
    const { connections } = this;
    if (device.connection && connections.includes(device.connection)) {
      const timeout = await device.connection.ping(device.address);
      if (timeout !== -1) return timeout;
      device.connection = undefined;
      this.emit('disconnected', device);
      // device.emit('disconnected');
    }

    const mib = Reflect.getMetadata('mib', device);
    const occupied = devices.get()
      .map(device => device.connection!)
      .filter(connection => connection != null && !connection.description.link);
    const acceptables = _.difference(connections, occupied)
      .filter(({ description }) => description.link || description.mib === mib);
    if (acceptables.length === 0) return -1;

    const [timeout, connection] = await Promise.race(acceptables.map(
      connection => connection.ping(device.address)
        .then(t => [t, connection] as [number, NibusConnection])));
    if (timeout === -1) {
      // ping(acceptables[0], device.address);
      return -1;
    }

    this._connectDevice(device, connection);
    return timeout;
  }

  async ping(address: AddressParam): Promise<number> {
    const { connections } = this;
    const addr = new Address(address);
    if (connections.length === 0) return Promise.resolve(-1);
    return Promise.race(connections.map(connection => connection.ping(addr)));
  }

  get ports() {
    return this.connections.length;
  }
}

const session = new NibusSession();

devices.on('new', (device: IDevice) => {
  if (!device.connection) {
    session.pingDevice(device).catch(noop);
  }
});

devices.on('delete', (device: IDevice) => {
  if (device.connection) {
    device.connection = undefined;
    session.emit('disconnected', device);
    // device.emit('disconnected');
  }
});

session.on('found', ({ address, connection }) => {
  console.assert(
    address.type === AddressType.mac || address.type === 'empty',
    'mac-address expected',
  );
  const devs = devices.find(address);
  if (devs && devs.length === 1) {
    session._connectDevice(devs[0], connection);
  }
});

process.on('SIGINT', () => session.close());
process.on('SIGTERM', () => session.close());

export default session;