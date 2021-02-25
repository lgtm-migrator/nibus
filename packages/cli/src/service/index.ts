/*
 * @license
 * Copyright (c) 2020. Nata-Info
 * @author Andrei Sarakeev <avs@nata-info.ru>
 *
 * This file is part of the "@nibus" project.
 * For the full copyright and license information, please view
 * the EULA file that was distributed with this source code.
 */
/* eslint-disable no-bitwise */

import {
  Config,
  Fields,
  getMibFile,
  getMibs,
  IKnownPort,
  IMibDeviceType,
  LogLevel,
  MibDeviceV,
  NibusDatagram,
  NibusDecoder,
  PATH,
  printBuffer,
  toInt,
} from '@nibus/core';
import Configstore from 'configstore';
import { isLeft } from 'fp-ts/lib/Either';
import fs from 'fs';
import _ from 'lodash';
import { Socket } from 'net';
import { createInterface } from 'readline';
import mdns from 'mdns';

import debugFactory from '../debug';
import { SerialTee, Server } from '../ipc';
import { SerialLogger } from '../ipc/SerialTee';

import { Direction } from '../ipc/Server';

import detector from './detector';

const pkgName = '@nata/nibus.js'; // = require('../../package.json');
const conf = new Configstore(pkgName, {
  logLevel: 'none',
  omit: ['priority'],
});

// debugFactory.enable('nibus:detector,nibus.service');
const debug = debugFactory('nibus:service');
const debugIn = debugFactory('nibus:<<<');
const debugOut = debugFactory('nibus:>>>');

debug(`config path: ${conf.path}`);

const noop = (): void => {};

if (process.platform === 'win32') {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('SIGINT', () => process.emit('SIGINT', 'SIGINT'));
}

const minVersionToInt = (str?: string): number => {
  if (!str) return 0;
  const [high, low] = str.split('.', 2);
  return (toInt(high) << 8) + toInt(low);
};

async function updateMibTypes(): Promise<void> {
  const mibs = await getMibs();
  conf.set('mibs', mibs);
  const mibTypes: Config['mibTypes'] = {};
  mibs.forEach(mib => {
    const mibfile = getMibFile(mib);
    const validation = MibDeviceV.decode(JSON.parse(fs.readFileSync(mibfile).toString()));
    if (isLeft(validation)) {
      debug(`<error>: Invalid mib file ${mibfile}`);
    } else {
      const { types } = validation.right;
      const device = types[validation.right.device] as IMibDeviceType;
      const type = toInt(device.appinfo.device_type);
      const minVersion = minVersionToInt(device.appinfo.min_version);
      const currentMibs = mibTypes[type] || [];
      currentMibs.push({
        mib,
        minVersion,
      });
      mibTypes[type] = _.sortBy(currentMibs, 'minVersion');
    }
  });
  conf.set('mibTypes', mibTypes);
}

updateMibTypes().catch(e => debug(`<error> ${e.message}`));

// const direction = (dir: Direction) => dir === Direction.in ? '<<<' : '>>>';
const decoderIn = new NibusDecoder();
decoderIn.on('data', (datagram: NibusDatagram) => {
  debugIn(
    datagram.toString({
      pick: conf.get('pick') as Fields,
      omit: conf.get('omit') as Fields,
    })
  );
});
const decoderOut = new NibusDecoder();
decoderOut.on('data', (datagram: NibusDatagram) => {
  debugOut(
    datagram.toString({
      pick: conf.get('pick') as Fields,
      omit: conf.get('omit') as Fields,
    })
  );
});

const loggers = {
  none: null,
  hex: (data: Buffer, dir: Direction) => {
    switch (dir) {
      case Direction.in:
        debugIn(printBuffer(data));
        break;
      case Direction.out:
        debugOut(printBuffer(data));
        break;
      default:
        console.warn('invalid direction', dir);
        break;
    }
  },
  nibus: (data: Buffer, dir: Direction) => {
    switch (dir) {
      case Direction.in:
        decoderIn.write(data);
        break;
      case Direction.out:
        decoderOut.write(data);
        break;
      default:
        console.warn('invalid direction', dir);
        break;
    }
  },
};

export class NibusService {
  private readonly server: Server;

  private isStarted = false;

  private connections: SerialTee[] = [];

  private ad = mdns.createAdvertisement(mdns.tcp('nibus'), +(process.env.NIBUS_PORT ?? 9001), {
    // eslint-disable-next-line @typescript-eslint/no-var-requires,global-require
    txtRecord: { version: require('../../package.json').version },
  });

  constructor() {
    this.server = new Server(PATH);
    this.server.on('connection', this.connectionHandler);
    this.server.on('client:setLogLevel', this.logLevelHandler);
    this.server.on('client:reloadDevices', this.reload);
  }

  get path(): string {
    return this.server.path;
  }

  updateLogger(connection?: SerialTee): void {
    const logger: SerialLogger | null = loggers[conf.get('logLevel') as LogLevel];
    const connections = connection ? [connection] : this.connections;
    connections.forEach(con => con.setLogger(logger));
  }

  public start(): Promise<void> {
    if (this.isStarted) return Promise.resolve();
    this.isStarted = true;
    this.ad.start();
    const detection = detector.getDetection();
    if (detection == null) throw new Error('detection is N/A');
    detector.on('add', this.addHandler);
    detector.on('remove', this.removeHandler);

    const promise = new Promise<void>((resolve, reject) => {
      detector
        .getPorts()
        .then(() => resolve())
        .catch(err => {
          console.error('error while get ports', err.stack);
          reject(err);
        });
    });

    detector.start();
    process.once('SIGINT', () => this.stop());
    process.once('SIGTERM', () => this.stop());
    debug('started');
    return promise;
  }

  public stop(): void {
    if (!this.isStarted) return;
    this.ad.stop();
    const connections = this.connections.splice(0, this.connections.length);
    if (connections.length) {
      // Хак, нужен чтобы успеть закрыть все соединения, иначе не успевает их закрыть и выходит
      setTimeout(() => {
        connections.forEach(connection => connection.close());
      }, 0);
    }
    detector.removeListener('add', this.addHandler);
    detector.removeListener('remove', this.removeHandler);
    detector.stop();
    this.server.close();
    this.isStarted = false;
    debug('stopped');
  }

  // eslint-disable-next-line class-methods-use-this
  reload(): void {
    detector.reload();
  }

  private logLevelHandler = (
    client: Socket,
    logLevel: LogLevel | undefined,
    pickFields: Fields,
    omitFields: Fields
  ): void => {
    debug(`setLogLevel: ${logLevel}`);
    if (logLevel) {
      conf.set('logLevel', logLevel);
      this.server
        .broadcast('logLevel', logLevel)
        .catch(e => debug(`error while broadcast: ${e.message}`));
    }
    pickFields && conf.set('pick', pickFields);
    omitFields && conf.set('omit', omitFields);
    this.updateLogger();
  };

  private connectionHandler = (socket: Socket): void => {
    const { server, connections } = this;
    server
      .send(
        socket,
        'ports',
        connections.map(connection => connection.toJSON())
      )
      .catch(err => debug(`<error> ${err.stack}`));
    debug(`logLevel`, conf.get('logLevel'));
    server
      .send(socket, 'logLevel', conf.get('logLevel'))
      .catch(e => debug(`error while send logLevel ${e.message}`));
  };

  private addHandler = (portInfo: IKnownPort): void => {
    const { category } = portInfo;
    const mibCategory = detector.getDetection()!.mibCategories[category!];
    if (mibCategory) {
      const connection = new SerialTee(portInfo, mibCategory);
      connection.on('close', (path: string) => this.removeHandler({ path }));
      this.connections.push(connection);
      this.server.broadcast('add', connection.toJSON()).catch(noop);
      this.updateLogger(connection);
      // this.find(connection);
    }
  };

  private removeHandler = ({ path }: { path: string }): void => {
    const index = this.connections.findIndex(({ portInfo: { path: port } }) => port === path);
    if (index !== -1) {
      const [connection] = this.connections.splice(index, 1);
      // debug(`nibus-connection was closed ${connection.description.category}`);
      connection.close();
      this.server.broadcast('remove', connection.toJSON()).catch(noop);
    }
  };
}

const service = new NibusService();

export { detectionPath } from './detector';

export default service;
