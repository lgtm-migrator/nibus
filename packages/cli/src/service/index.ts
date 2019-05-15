/*
 * @license
 * Copyright (c) 2019. Nata-Info
 * @author Andrei Sarakeev <avs@nata-info.ru>
 *
 * This file is part of the "@nata" project.
 * For the full copyright and license information, please view
 * the EULA file that was distributed with this source code.
 */

import Configstore from 'configstore';
import debugFactory from 'debug';
import { Socket } from 'net';
import _ from 'lodash';
import { SerialTee, Server } from '../ipc';
import { SerialLogger } from '../ipc/SerialTee';
import { Direction } from '../ipc/Server';
import { getMibFile, getMibs, toInt } from '@nibus/core/lib/mib';
import { IMibDeviceType, MibDeviceV } from '@nibus/core/lib/mib/devices';
import { NibusDatagram, NibusDecoder } from '@nibus/core/lib/nibus';
import { printBuffer } from '@nibus/core/lib/nibus/helper';
import { createInterface } from 'readline';
import fs from 'fs';
import { Config, LogLevel, PATH } from '@nibus/core';
import detector from './detector';
import { IKnownPort } from '@nibus/core/lib/session/KnownPorts';

const pkgName = '@nata/nibus.js'; // = require('../../package.json');
const conf = new Configstore(
  pkgName,
  {
    logLevel: 'none',
    omit: ['priority'],
  },
);

// debugFactory.enable('nibus:detector,nibus.service');
const debug = debugFactory('nibus:service');
const debugIn = debugFactory('nibus:INP<<<');
const debugOut = debugFactory('nibus:OUT>>>');

debug(`config path: ${conf.path}`);

const noop = () => {};

if (process.platform === 'win32') {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on('SIGINT', () => process.emit('SIGINT', 'SIGINT'));
}

type Fields = string[] | undefined;

const minVersionToInt = (str?: string) => {
  if (!str) return 0;
  const [high, low] = str.split('.', 2);
  return (toInt(high) << 8) + toInt(low);
};

async function updateMibTypes() {
  const mibs = await getMibs();
  conf.set('mibs', mibs);
  const mibTypes: Config['mibTypes'] = {};
  mibs.forEach((mib) => {
    const mibfile = getMibFile(mib);
    const validation = MibDeviceV.decode(JSON.parse(fs.readFileSync(mibfile).toString()));
    if (validation.isLeft()) {
      debug(`<error>: Invalid mib file ${mibfile}`);
    } else {
      const { types } = validation.value;
      const device = types[validation.value.device] as IMibDeviceType;
      const type = toInt(device.appinfo.device_type);
      const minVersion = minVersionToInt(device.appinfo.min_version);
      const mibs = mibTypes[type] || [];
      mibs.push({
        mib,
        minVersion,
      });
      mibTypes[type] = _.sortBy(mibs, 'minVersion');
    }
  });
  conf.set('mibTypes', mibTypes);
}

updateMibTypes().catch(e => debug(`<error> ${e.message}`));

// const direction = (dir: Direction) => dir === Direction.in ? '<<<' : '>>>';
const decoderIn = new NibusDecoder();
decoderIn.on('data', (datagram: NibusDatagram) => {
  debugIn(datagram.toString({
    pick: conf.get('pick') as Fields,
    omit: conf.get('omit') as Fields,
  }));
});
const decoderOut = new NibusDecoder();
decoderOut.on('data', (datagram: NibusDatagram) => {
  debugOut(datagram.toString({
    pick: conf.get('pick') as Fields,
    omit: conf.get('omit') as Fields,
  }));
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
    }
  },
};

class NibusService {
  private readonly server: Server;
  private isStarted = false;
  private connections: SerialTee[] = [];

  constructor() {
    this.server = new Server(PATH);
    this.server.on('connection', this.connectionHandler);
    this.server.on('client:setLogLevel', this.logLevelHandler);
  }

  updateLogger(connection?: SerialTee) {
    const logger: SerialLogger | null = loggers[conf.get('logLevel') as LogLevel];
    const connections = connection ? [connection] : this.connections;
    connections.forEach(con => con.setLogger(logger));
  }

  private logLevelHandler = (
    client: Socket,
    logLevel: LogLevel | undefined,
    pickFields: Fields,
    omitFields: Fields) => {
    logLevel && conf.set('logLevel', logLevel);
    pickFields && conf.set('pick', pickFields);
    omitFields && conf.set('omit', omitFields);
    this.updateLogger();
  };

  private connectionHandler = (socket: Socket) => {
    const { server, connections } = this;
    server
      .send(socket, 'ports', connections.map(connection => connection.toJSON()))
      .catch((err) => {
        debug('<error>', err.stack);
      });
  };

  private addHandler = (portInfo: IKnownPort) => {
    const { category } = portInfo;
    const mibCategory = detector.detection!.mibCategories[category!];
    if (mibCategory) {
      const connection = new SerialTee(portInfo, mibCategory);
      connection.on('close', (comName: string) => this.removeHandler({ comName }));
      this.connections.push(connection);
      this.server.broadcast('add', connection.toJSON()).catch(noop);
      this.updateLogger(connection);
      // this.find(connection);
    }
  };

  private removeHandler = ({ comName }: { comName: string }) => {
    const index = this.connections.findIndex(({ portInfo: { comName: port } }) => port === comName);
    if (index !== -1) {
      const [connection] = this.connections.splice(index, 1);
      // debug(`nibus-connection was closed ${connection.description.category}`);
      connection.close();
      this.server.broadcast('remove', connection.toJSON()).catch(noop);
    }
  };

  public start() {
    if (this.isStarted) return;
    this.isStarted = true;
    const { detection } = detector;
    if (detection == null) throw new Error('detection is N/A');
    detector.on('add', this.addHandler);
    detector.on('remove', this.removeHandler);
    detector.getPorts().catch((err) => {
      console.error('error while get ports', err.stack);
    });

    detector.start();
    process.once('SIGINT', () => this.stop());
    process.once('SIGTERM', () => this.stop());
    /**
     * @event NibusService#start
     */
    debug('started');
  }

  public stop() {
    if (!this.isStarted) return;
    const connections = this.connections.splice(0, this.connections.length);
    if (connections.length) {
      // Хак, нужен чтобы успеть закрыть все соединения, иначе не успевает их закрыть и выходит
      setTimeout(() => {
        connections.forEach(connection => connection.close());
      }, 0);
    }
    detector.removeListener('add', this.addHandler);
    detector.removeListener('remove', this.removeHandler);
    // detector.stop();
    this.isStarted = false;
    debug('stopped');
  }

  get path() {
    return this.server.path;
  }
}

const service = new NibusService();

export default service;