"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;

require("source-map-support/register");

var _debug = _interopRequireDefault(require("debug"));

var _events = require("events");

var _fs = _interopRequireDefault(require("fs"));

var _PathReporter = require("io-ts/lib/PathReporter");

var _jsYaml = _interopRequireDefault(require("js-yaml"));

var _lodash = _interopRequireDefault(require("lodash"));

var _path = _interopRequireDefault(require("path"));

var _serialport = _interopRequireDefault(require("serialport"));

var _usbDetection = _interopRequireDefault(require("usb-detection"));

var _KnownPorts = require("@nibus/core/lib/session/KnownPorts");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
 * @license
 * Copyright (c) 2019. Nata-Info
 * @author Andrei Sarakeev <avs@nata-info.ru>
 *
 * This file is part of the "@nata" project.
 * For the full copyright and license information, please view
 * the EULA file that was distributed with this source code.
 */

/* tslint:disable:variable-name */
// let usbDetection: typeof UsbDetection;
const debug = (0, _debug.default)('nibus:detector');

const detectionPath = _path.default.resolve(__dirname, '../../detection.yml');

let knownPorts = Promise.resolve([]);

const loadDetection = () => {
  try {
    const data = _fs.default.readFileSync(detectionPath, 'utf8');

    const result = _jsYaml.default.safeLoad(data);

    Object.keys(result.mibCategories).forEach(category => {
      const desc = result.mibCategories[category];
      desc.category = category;

      if (Array.isArray(desc.select)) {
        desc.select = desc.select.map(cat => result.mibCategories[cat] || cat);
      }
    });
    return result;
  } catch (err) {
    debug(`Error: failed to read file ${detectionPath} (${err.message})`);
    return undefined;
  }
};

let detection = loadDetection();

function reloadDevices(lastAdded) {
  knownPorts = knownPorts.then(ports => reloadDevicesAsync(ports, lastAdded));
}

const detectionListener = (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    debug(`detection file was changed, reloading devices...`);
    detection = undefined;
    reloadDevices();
  }
};
/**
 * @fires add
 * @fires remove
 * @fires plug
 * @fires unplug
 */


class Detector extends _events.EventEmitter {
  start() {
    // usbDetection = require('usb-detection');
    _usbDetection.default.startMonitoring();

    debug(`start watching the detector file ${detectionPath}`);

    _fs.default.watchFile(detectionPath, {
      persistent: false
    }, detectionListener); // detection = loadDetection();


    reloadDevices(); // Должна быть debounce с задержкой, иначе Serial.list не определит

    _usbDetection.default.on('add', reload); // Удаление без задержки!


    _usbDetection.default.on('remove', reloadDevices);
  }

  stop() {
    _fs.default.unwatchFile(detectionPath, detectionListener);

    _usbDetection.default && _usbDetection.default.stopMonitoring();
  }

  restart() {
    if (!_usbDetection.default) return this.start();

    _usbDetection.default.stopMonitoring();

    process.nextTick(() => _usbDetection.default.startMonitoring());
  }

  async getPorts() {
    return knownPorts;
  }

  get detection() {
    return detection;
  }

}

const detector = new Detector(); // interface ISerialPort {
//   comName: string;
//   locationId?: string;
//   manufacturer?: string;
//   pnpId?: string;
//   productId: HexOrNumber;
//   serialNumber: string;
//   vendorId: HexOrNumber;
// }
// type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
//
// export interface IKnownPort extends Omit<SerialPort.PortInfo, 'productId' | 'vendorId'> {
//   device?: string;
//   productId: number;
//   vendorId: number;
//   category?: string;
// }

const getId = id => typeof id === 'string' ? parseInt(id, 16) : id;

function equals(port, device) {
  return getId(port.productId) === device.productId && getId(port.vendorId) === device.vendorId && port.serialNumber === device.serialNumber;
}

async function detectDevice(port, lastAdded) {
  let detected;

  if (lastAdded && equals(port, lastAdded)) {
    detected = lastAdded;
  } else {
    let list = await _usbDetection.default.find(getId(port.vendorId), getId(port.productId), () => {});
    const {
      serialNumber,
      manufacturer
    } = port;
    list = _lodash.default.filter(list, {
      serialNumber,
      manufacturer
    });

    if (list.length === 0) {
      debug(`Unknown device ${JSON.stringify(port)}`);
    } else if (list.length > 1) {
      debug(`can't identify device ${JSON.stringify(port)}`);
    } else {
      [detected] = list;
    }
  }

  if (detected !== undefined) {
    const {
      productId,
      vendorId,
      deviceName: device,
      deviceAddress
    } = detected;
    return { ...port,
      productId,
      vendorId,
      device,
      deviceAddress
    };
  }

  return { ...port,
    productId: getId(port.productId),
    vendorId: getId(port.vendorId)
  };
} // const loadDetection = () => new Promise<IDetection>((resolve, reject) => {
//   fs.readFile(detectionPath, 'utf8', (err, data) => {
//     if (err) {
//       reject(`Error: failed to read file ${detectionPath} (${err.message})`);
//     } else {
//       const result = yaml.safeLoad(data) as IDetection;
//       Object.keys(result.mibCategories).forEach((category) => {
//         result.mibCategories[category].category = category;
//       });
//       resolve(result);
//     }
//   });
// });


const matchCategory = port => {
  const match = detection && _lodash.default.find(detection.knownDevices, item => (!item.device || port.device && port.device.startsWith(item.device)) && (!item.serialNumber || port.serialNumber && port.serialNumber.startsWith(item.serialNumber)) && (!item.manufacturer || port.manufacturer === item.manufacturer) && getId(item.vid) === port.vendorId && getId(item.pid) === port.productId);

  if (!match && process.platform === 'win32' && (port.productId === 0x6001 || port.productId === 0x6015) && port.vendorId === 0x0403) {
    return 'ftdi';
  }

  if (match) return _KnownPorts.CategoryV.decode(match.category).getOrElse(undefined);
};

async function reloadDevicesAsync(prevPorts, lastAdded) {
  const ports = [];

  try {
    if (detection == null) {
      detection = loadDetection();
    }

    const list = await _serialport.default.list();
    const externalPorts = list.filter(port => !!port.productId); // const prevPorts = knownPorts.splice(0);

    await externalPorts.reduce(async (promise, port) => {
      const nextPorts = await promise;

      const prev = _lodash.default.findIndex(prevPorts, {
        comName: port.comName
      });

      let device;

      if (prev !== -1) {
        [device] = prevPorts.splice(prev, 1);
        const category = matchCategory(device);

        if (category !== device.category) {
          debug(`device's category was changed ${device.category} to ${category}`);
          device.category && detector.emit('remove', device);
          device.category = _KnownPorts.CategoryV.decode(category).getOrElse(undefined);
          device.category && detector.emit('add', device);
        }
      } else {
        device = await detectDevice(port, lastAdded);
        device.category = matchCategory(device);
        /**
         * new device plugged
         * @event Detector#plug
         */

        detector.emit('plug', device); // console.log('PORT', JSON.stringify(port));

        if (device.category) {
          debug(`new device ${device.device || device.vendorId}/\
${device.category} was plugged to ${device.comName}`);
          detector.emit('add', device);
        } else {
          debug('unknown device %o was plugged', device);
        }
      }

      const validation = _KnownPorts.KnownPortV.decode(device);

      if (validation.isLeft()) {
        debug('<error>', _PathReporter.PathReporter.report(validation));
      } else {
        nextPorts.push(validation.value);
      }

      return nextPorts;
    }, Promise.resolve(ports));
    prevPorts.forEach(port => {
      /**
       * @event Detector#unplug
       */
      detector.emit('unplug', port);
      debug(`device ${port.device || port.vendorId}/\
${port.category || port.productId} was unplugged from ${port.comName}`);
      /**
       * device with category was removed
       * @event Detector#remove
       * @param {IKnownPort} device
       */

      port.category && detector.emit('remove', port);
    });
    return ports;
  } catch (err) {
    debug(`Error: reload devices was failed (${err.message || err})`);
    return ports;
  }
} // debug(`start watching the detector file ${detectionPath}`);
// fs.watchFile(detectionPath, { persistent: false }, (curr, prev) => {
//   if (curr.mtime !== prev.mtime) {
//     debug(`detection file was changed, reloading devices...`);
//     detection = undefined;
//     reloadDevices().catch();
//   }
// });
// reloadDevices();


const reload = _lodash.default.debounce(reloadDevices, 2000);

var _default = detector;
exports.default = _default;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9zZXJ2aWNlL2RldGVjdG9yLnRzIl0sIm5hbWVzIjpbImRlYnVnIiwiZGV0ZWN0aW9uUGF0aCIsInBhdGgiLCJyZXNvbHZlIiwiX19kaXJuYW1lIiwia25vd25Qb3J0cyIsIlByb21pc2UiLCJsb2FkRGV0ZWN0aW9uIiwiZGF0YSIsImZzIiwicmVhZEZpbGVTeW5jIiwicmVzdWx0IiwieWFtbCIsInNhZmVMb2FkIiwiT2JqZWN0Iiwia2V5cyIsIm1pYkNhdGVnb3JpZXMiLCJmb3JFYWNoIiwiY2F0ZWdvcnkiLCJkZXNjIiwiQXJyYXkiLCJpc0FycmF5Iiwic2VsZWN0IiwibWFwIiwiY2F0IiwiZXJyIiwibWVzc2FnZSIsInVuZGVmaW5lZCIsImRldGVjdGlvbiIsInJlbG9hZERldmljZXMiLCJsYXN0QWRkZWQiLCJ0aGVuIiwicG9ydHMiLCJyZWxvYWREZXZpY2VzQXN5bmMiLCJkZXRlY3Rpb25MaXN0ZW5lciIsImN1cnIiLCJwcmV2IiwibXRpbWUiLCJEZXRlY3RvciIsIkV2ZW50RW1pdHRlciIsInN0YXJ0IiwidXNiRGV0ZWN0aW9uIiwic3RhcnRNb25pdG9yaW5nIiwid2F0Y2hGaWxlIiwicGVyc2lzdGVudCIsIm9uIiwicmVsb2FkIiwic3RvcCIsInVud2F0Y2hGaWxlIiwic3RvcE1vbml0b3JpbmciLCJyZXN0YXJ0IiwicHJvY2VzcyIsIm5leHRUaWNrIiwiZ2V0UG9ydHMiLCJkZXRlY3RvciIsImdldElkIiwiaWQiLCJwYXJzZUludCIsImVxdWFscyIsInBvcnQiLCJkZXZpY2UiLCJwcm9kdWN0SWQiLCJ2ZW5kb3JJZCIsInNlcmlhbE51bWJlciIsImRldGVjdERldmljZSIsImRldGVjdGVkIiwibGlzdCIsImZpbmQiLCJtYW51ZmFjdHVyZXIiLCJfIiwiZmlsdGVyIiwibGVuZ3RoIiwiSlNPTiIsInN0cmluZ2lmeSIsImRldmljZU5hbWUiLCJkZXZpY2VBZGRyZXNzIiwibWF0Y2hDYXRlZ29yeSIsIm1hdGNoIiwia25vd25EZXZpY2VzIiwiaXRlbSIsInN0YXJ0c1dpdGgiLCJ2aWQiLCJwaWQiLCJwbGF0Zm9ybSIsIkNhdGVnb3J5ViIsImRlY29kZSIsImdldE9yRWxzZSIsInByZXZQb3J0cyIsIlNlcmlhbFBvcnQiLCJleHRlcm5hbFBvcnRzIiwicmVkdWNlIiwicHJvbWlzZSIsIm5leHRQb3J0cyIsImZpbmRJbmRleCIsImNvbU5hbWUiLCJzcGxpY2UiLCJlbWl0IiwidmFsaWRhdGlvbiIsIktub3duUG9ydFYiLCJpc0xlZnQiLCJQYXRoUmVwb3J0ZXIiLCJyZXBvcnQiLCJwdXNoIiwidmFsdWUiLCJkZWJvdW5jZSJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7O0FBV0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBRUE7Ozs7QUFyQkE7Ozs7Ozs7Ozs7QUFVQTtBQW1CQTtBQUNBLE1BQU1BLEtBQUssR0FBRyxvQkFBYSxnQkFBYixDQUFkOztBQUNBLE1BQU1DLGFBQWEsR0FBR0MsY0FBS0MsT0FBTCxDQUFhQyxTQUFiLEVBQXdCLHFCQUF4QixDQUF0Qjs7QUFDQSxJQUFJQyxVQUFpQyxHQUFHQyxPQUFPLENBQUNILE9BQVIsQ0FBZ0IsRUFBaEIsQ0FBeEM7O0FBa0JBLE1BQU1JLGFBQWEsR0FBRyxNQUE4QjtBQUNsRCxNQUFJO0FBQ0YsVUFBTUMsSUFBSSxHQUFHQyxZQUFHQyxZQUFILENBQWdCVCxhQUFoQixFQUErQixNQUEvQixDQUFiOztBQUNBLFVBQU1VLE1BQU0sR0FBR0MsZ0JBQUtDLFFBQUwsQ0FBY0wsSUFBZCxDQUFmOztBQUNBTSxJQUFBQSxNQUFNLENBQUNDLElBQVAsQ0FBWUosTUFBTSxDQUFDSyxhQUFuQixFQUFrQ0MsT0FBbEMsQ0FBMkNDLFFBQUQsSUFBYztBQUN0RCxZQUFNQyxJQUFJLEdBQUdSLE1BQU0sQ0FBQ0ssYUFBUCxDQUFxQkUsUUFBckIsQ0FBYjtBQUNBQyxNQUFBQSxJQUFJLENBQUNELFFBQUwsR0FBZ0JBLFFBQWhCOztBQUNBLFVBQUlFLEtBQUssQ0FBQ0MsT0FBTixDQUFjRixJQUFJLENBQUNHLE1BQW5CLENBQUosRUFBZ0M7QUFDOUJILFFBQUFBLElBQUksQ0FBQ0csTUFBTCxHQUFlSCxJQUFJLENBQUNHLE1BQU4sQ0FDWEMsR0FEVyxDQUNQQyxHQUFHLElBQUliLE1BQU0sQ0FBQ0ssYUFBUCxDQUFxQlEsR0FBckIsS0FBNkJBLEdBRDdCLENBQWQ7QUFFRDtBQUNGLEtBUEQ7QUFRQSxXQUFPYixNQUFQO0FBQ0QsR0FaRCxDQVlFLE9BQU9jLEdBQVAsRUFBWTtBQUNaekIsSUFBQUEsS0FBSyxDQUFFLDhCQUE2QkMsYUFBYyxLQUFJd0IsR0FBRyxDQUFDQyxPQUFRLEdBQTdELENBQUw7QUFDQSxXQUFPQyxTQUFQO0FBQ0Q7QUFDRixDQWpCRDs7QUFtQkEsSUFBSUMsU0FBUyxHQUFHckIsYUFBYSxFQUE3Qjs7QUFFQSxTQUFTc0IsYUFBVCxDQUF1QkMsU0FBdkIsRUFBeUQ7QUFDdkR6QixFQUFBQSxVQUFVLEdBQUdBLFVBQVUsQ0FBQzBCLElBQVgsQ0FBZ0JDLEtBQUssSUFBSUMsa0JBQWtCLENBQUNELEtBQUQsRUFBUUYsU0FBUixDQUEzQyxDQUFiO0FBQ0Q7O0FBRUQsTUFBTUksaUJBQWlCLEdBQUcsQ0FBQ0MsSUFBRCxFQUFjQyxJQUFkLEtBQThCO0FBQ3RELE1BQUlELElBQUksQ0FBQ0UsS0FBTCxLQUFlRCxJQUFJLENBQUNDLEtBQXhCLEVBQStCO0FBQzdCckMsSUFBQUEsS0FBSyxDQUFFLGtEQUFGLENBQUw7QUFDQTRCLElBQUFBLFNBQVMsR0FBR0QsU0FBWjtBQUNBRSxJQUFBQSxhQUFhO0FBQ2Q7QUFDRixDQU5EO0FBUUE7Ozs7Ozs7O0FBTUEsTUFBTVMsUUFBTixTQUF1QkMsb0JBQXZCLENBQW9DO0FBQ2xDQyxFQUFBQSxLQUFLLEdBQUc7QUFDTjtBQUNBQywwQkFBYUMsZUFBYjs7QUFDQTFDLElBQUFBLEtBQUssQ0FBRSxvQ0FBbUNDLGFBQWMsRUFBbkQsQ0FBTDs7QUFDQVEsZ0JBQUdrQyxTQUFILENBQWExQyxhQUFiLEVBQTRCO0FBQUUyQyxNQUFBQSxVQUFVLEVBQUU7QUFBZCxLQUE1QixFQUFtRFYsaUJBQW5ELEVBSk0sQ0FLTjs7O0FBQ0FMLElBQUFBLGFBQWEsR0FOUCxDQU9OOztBQUNBWSwwQkFBYUksRUFBYixDQUFnQixLQUFoQixFQUF1QkMsTUFBdkIsRUFSTSxDQVNOOzs7QUFDQUwsMEJBQWFJLEVBQWIsQ0FBZ0IsUUFBaEIsRUFBMEJoQixhQUExQjtBQUNEOztBQUVEa0IsRUFBQUEsSUFBSSxHQUFHO0FBQ0x0QyxnQkFBR3VDLFdBQUgsQ0FBZS9DLGFBQWYsRUFBOEJpQyxpQkFBOUI7O0FBQ0FPLDZCQUFnQkEsc0JBQWFRLGNBQWIsRUFBaEI7QUFDRDs7QUFFREMsRUFBQUEsT0FBTyxHQUFHO0FBQ1IsUUFBSSxDQUFDVCxxQkFBTCxFQUFtQixPQUFPLEtBQUtELEtBQUwsRUFBUDs7QUFDbkJDLDBCQUFhUSxjQUFiOztBQUNBRSxJQUFBQSxPQUFPLENBQUNDLFFBQVIsQ0FBaUIsTUFBTVgsc0JBQWFDLGVBQWIsRUFBdkI7QUFDRDs7QUFFRCxRQUFNVyxRQUFOLEdBQWlCO0FBQ2YsV0FBT2hELFVBQVA7QUFDRDs7QUFFRCxNQUFJdUIsU0FBSixHQUF3QztBQUN0QyxXQUFPQSxTQUFQO0FBQ0Q7O0FBL0JpQzs7QUFrQ3BDLE1BQU0wQixRQUFRLEdBQUcsSUFBSWhCLFFBQUosRUFBakIsQyxDQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FBRUEsTUFBTWlCLEtBQUssR0FBSUMsRUFBRCxJQUFzQixPQUFPQSxFQUFQLEtBQWMsUUFBZCxHQUF5QkMsUUFBUSxDQUFDRCxFQUFELEVBQUssRUFBTCxDQUFqQyxHQUE0Q0EsRUFBaEY7O0FBRUEsU0FBU0UsTUFBVCxDQUFnQkMsSUFBaEIsRUFBMkNDLE1BQTNDLEVBQWtGO0FBQ2hGLFNBQU9MLEtBQUssQ0FBQ0ksSUFBSSxDQUFDRSxTQUFOLENBQUwsS0FBMEJELE1BQU0sQ0FBQ0MsU0FBakMsSUFDRk4sS0FBSyxDQUFDSSxJQUFJLENBQUNHLFFBQU4sQ0FBTCxLQUF5QkYsTUFBTSxDQUFDRSxRQUQ5QixJQUVGSCxJQUFJLENBQUNJLFlBQUwsS0FBc0JILE1BQU0sQ0FBQ0csWUFGbEM7QUFHRDs7QUFFRCxlQUFlQyxZQUFmLENBQTRCTCxJQUE1QixFQUF1RDdCLFNBQXZELEVBQ3dCO0FBQ3RCLE1BQUltQyxRQUFKOztBQUNBLE1BQUluQyxTQUFTLElBQUk0QixNQUFNLENBQUNDLElBQUQsRUFBTzdCLFNBQVAsQ0FBdkIsRUFBMEM7QUFDeENtQyxJQUFBQSxRQUFRLEdBQUduQyxTQUFYO0FBQ0QsR0FGRCxNQUVPO0FBQ0wsUUFBSW9DLElBQUksR0FBRyxNQUFNekIsc0JBQWEwQixJQUFiLENBQWtCWixLQUFLLENBQUNJLElBQUksQ0FBQ0csUUFBTixDQUF2QixFQUF5Q1AsS0FBSyxDQUFDSSxJQUFJLENBQUNFLFNBQU4sQ0FBOUMsRUFBaUUsTUFBTSxDQUFFLENBQXpFLENBQWpCO0FBQ0EsVUFBTTtBQUFFRSxNQUFBQSxZQUFGO0FBQWdCSyxNQUFBQTtBQUFoQixRQUFpQ1QsSUFBdkM7QUFDQU8sSUFBQUEsSUFBSSxHQUFHRyxnQkFBRUMsTUFBRixDQUNMSixJQURLLEVBRUw7QUFDRUgsTUFBQUEsWUFERjtBQUVFSyxNQUFBQTtBQUZGLEtBRkssQ0FBUDs7QUFPQSxRQUFJRixJQUFJLENBQUNLLE1BQUwsS0FBZ0IsQ0FBcEIsRUFBdUI7QUFDckJ2RSxNQUFBQSxLQUFLLENBQUUsa0JBQWlCd0UsSUFBSSxDQUFDQyxTQUFMLENBQWVkLElBQWYsQ0FBcUIsRUFBeEMsQ0FBTDtBQUNELEtBRkQsTUFFTyxJQUFJTyxJQUFJLENBQUNLLE1BQUwsR0FBYyxDQUFsQixFQUFxQjtBQUMxQnZFLE1BQUFBLEtBQUssQ0FBRSx5QkFBd0J3RSxJQUFJLENBQUNDLFNBQUwsQ0FBZWQsSUFBZixDQUFxQixFQUEvQyxDQUFMO0FBQ0QsS0FGTSxNQUVBO0FBQ0wsT0FBQ00sUUFBRCxJQUFhQyxJQUFiO0FBQ0Q7QUFDRjs7QUFDRCxNQUFJRCxRQUFRLEtBQUt0QyxTQUFqQixFQUE0QjtBQUMxQixVQUFNO0FBQUVrQyxNQUFBQSxTQUFGO0FBQWFDLE1BQUFBLFFBQWI7QUFBdUJZLE1BQUFBLFVBQVUsRUFBRWQsTUFBbkM7QUFBMkNlLE1BQUFBO0FBQTNDLFFBQTZEVixRQUFuRTtBQUNBLFdBQU8sRUFDTCxHQUFHTixJQURFO0FBRUxFLE1BQUFBLFNBRks7QUFHTEMsTUFBQUEsUUFISztBQUlMRixNQUFBQSxNQUpLO0FBS0xlLE1BQUFBO0FBTEssS0FBUDtBQU9EOztBQUNELFNBQU8sRUFDTCxHQUFHaEIsSUFERTtBQUVMRSxJQUFBQSxTQUFTLEVBQUVOLEtBQUssQ0FBQ0ksSUFBSSxDQUFDRSxTQUFOLENBRlg7QUFHTEMsSUFBQUEsUUFBUSxFQUFFUCxLQUFLLENBQUNJLElBQUksQ0FBQ0csUUFBTjtBQUhWLEdBQVA7QUFLRCxDLENBRUQ7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQUVBLE1BQU1jLGFBQWEsR0FBSWpCLElBQUQsSUFBZ0M7QUFDcEQsUUFBTWtCLEtBQUssR0FBR2pELFNBQVMsSUFBSXlDLGdCQUFFRixJQUFGLENBQ3pCdkMsU0FBUyxDQUFFa0QsWUFEYyxFQUV6QkMsSUFBSSxJQUFJLENBQUMsQ0FBQ0EsSUFBSSxDQUFDbkIsTUFBTixJQUFpQkQsSUFBSSxDQUFDQyxNQUFMLElBQWVELElBQUksQ0FBQ0MsTUFBTCxDQUFZb0IsVUFBWixDQUF1QkQsSUFBSSxDQUFDbkIsTUFBNUIsQ0FBakMsTUFDRixDQUFDbUIsSUFBSSxDQUFDaEIsWUFBTixJQUNFSixJQUFJLENBQUNJLFlBQUwsSUFBcUJKLElBQUksQ0FBQ0ksWUFBTCxDQUFrQmlCLFVBQWxCLENBQTZCRCxJQUFJLENBQUNoQixZQUFsQyxDQUZyQixNQUdGLENBQUNnQixJQUFJLENBQUNYLFlBQU4sSUFBdUJULElBQUksQ0FBQ1MsWUFBTCxLQUFzQlcsSUFBSSxDQUFDWCxZQUhoRCxLQUlGYixLQUFLLENBQUN3QixJQUFJLENBQUNFLEdBQU4sQ0FBTCxLQUFvQnRCLElBQUksQ0FBQ0csUUFKdkIsSUFJcUNQLEtBQUssQ0FBQ3dCLElBQUksQ0FBQ0csR0FBTixDQUFMLEtBQW9CdkIsSUFBSSxDQUFDRSxTQU43QyxDQUEzQjs7QUFRQSxNQUFJLENBQUNnQixLQUFELElBQVUxQixPQUFPLENBQUNnQyxRQUFSLEtBQXFCLE9BQS9CLEtBQ0V4QixJQUFJLENBQUNFLFNBQUwsS0FBbUIsTUFBbkIsSUFBNkJGLElBQUksQ0FBQ0UsU0FBTCxLQUFtQixNQURsRCxLQUVDRixJQUFJLENBQUNHLFFBQUwsS0FBa0IsTUFGdkIsRUFFK0I7QUFDN0IsV0FBTyxNQUFQO0FBQ0Q7O0FBQ0QsTUFBSWUsS0FBSixFQUFXLE9BQU9PLHNCQUFVQyxNQUFWLENBQWlCUixLQUFLLENBQUMzRCxRQUF2QixFQUFpQ29FLFNBQWpDLENBQTJDM0QsU0FBM0MsQ0FBUDtBQUNaLENBZkQ7O0FBaUJBLGVBQWVNLGtCQUFmLENBQWtDc0QsU0FBbEMsRUFBMkR6RCxTQUEzRCxFQUE2RjtBQUMzRixRQUFNRSxLQUFtQixHQUFHLEVBQTVCOztBQUNBLE1BQUk7QUFDRixRQUFJSixTQUFTLElBQUksSUFBakIsRUFBdUI7QUFDckJBLE1BQUFBLFNBQVMsR0FBR3JCLGFBQWEsRUFBekI7QUFDRDs7QUFDRCxVQUFNMkQsSUFBMkIsR0FBRyxNQUFNc0Isb0JBQVd0QixJQUFYLEVBQTFDO0FBQ0EsVUFBTXVCLGFBQWEsR0FBR3ZCLElBQUksQ0FBQ0ksTUFBTCxDQUFZWCxJQUFJLElBQUksQ0FBQyxDQUFDQSxJQUFJLENBQUNFLFNBQTNCLENBQXRCLENBTEUsQ0FNRjs7QUFFQSxVQUFNNEIsYUFBYSxDQUFDQyxNQUFkLENBQXFCLE9BQU9DLE9BQVAsRUFBZ0JoQyxJQUFoQixLQUF5QjtBQUNsRCxZQUFNaUMsU0FBUyxHQUFHLE1BQU1ELE9BQXhCOztBQUNBLFlBQU12RCxJQUFJLEdBQUdpQyxnQkFBRXdCLFNBQUYsQ0FBWU4sU0FBWixFQUF1QjtBQUFFTyxRQUFBQSxPQUFPLEVBQUVuQyxJQUFJLENBQUNtQztBQUFoQixPQUF2QixDQUFiOztBQUNBLFVBQUlsQyxNQUFKOztBQUNBLFVBQUl4QixJQUFJLEtBQUssQ0FBQyxDQUFkLEVBQWlCO0FBQ2YsU0FBQ3dCLE1BQUQsSUFBVzJCLFNBQVMsQ0FBQ1EsTUFBVixDQUFpQjNELElBQWpCLEVBQXVCLENBQXZCLENBQVg7QUFDQSxjQUFNbEIsUUFBUSxHQUFHMEQsYUFBYSxDQUFDaEIsTUFBRCxDQUE5Qjs7QUFDQSxZQUFJMUMsUUFBUSxLQUFLMEMsTUFBTSxDQUFDMUMsUUFBeEIsRUFBa0M7QUFDaENsQixVQUFBQSxLQUFLLENBQUUsaUNBQWdDNEQsTUFBTSxDQUFDMUMsUUFBUyxPQUFNQSxRQUFTLEVBQWpFLENBQUw7QUFDQTBDLFVBQUFBLE1BQU0sQ0FBQzFDLFFBQVAsSUFBbUJvQyxRQUFRLENBQUMwQyxJQUFULENBQWMsUUFBZCxFQUF3QnBDLE1BQXhCLENBQW5CO0FBQ0FBLFVBQUFBLE1BQU0sQ0FBQzFDLFFBQVAsR0FBa0JrRSxzQkFBVUMsTUFBVixDQUFpQm5FLFFBQWpCLEVBQTJCb0UsU0FBM0IsQ0FBcUMzRCxTQUFyQyxDQUFsQjtBQUNBaUMsVUFBQUEsTUFBTSxDQUFDMUMsUUFBUCxJQUFtQm9DLFFBQVEsQ0FBQzBDLElBQVQsQ0FBYyxLQUFkLEVBQXFCcEMsTUFBckIsQ0FBbkI7QUFDRDtBQUNGLE9BVEQsTUFTTztBQUNMQSxRQUFBQSxNQUFNLEdBQUcsTUFBTUksWUFBWSxDQUFDTCxJQUFELEVBQU83QixTQUFQLENBQTNCO0FBQ0E4QixRQUFBQSxNQUFNLENBQUMxQyxRQUFQLEdBQWtCMEQsYUFBYSxDQUFDaEIsTUFBRCxDQUEvQjtBQUNBOzs7OztBQUlBTixRQUFBQSxRQUFRLENBQUMwQyxJQUFULENBQWMsTUFBZCxFQUFzQnBDLE1BQXRCLEVBUEssQ0FRTDs7QUFDQSxZQUFJQSxNQUFNLENBQUMxQyxRQUFYLEVBQXFCO0FBQ25CbEIsVUFBQUEsS0FBSyxDQUFFLGNBQWE0RCxNQUFNLENBQUNBLE1BQVAsSUFBaUJBLE1BQU0sQ0FBQ0UsUUFBUztFQUM3REYsTUFBTSxDQUFDMUMsUUFBUyxtQkFBa0IwQyxNQUFNLENBQUNrQyxPQUFRLEVBRHBDLENBQUw7QUFFQXhDLFVBQUFBLFFBQVEsQ0FBQzBDLElBQVQsQ0FBYyxLQUFkLEVBQXFCcEMsTUFBckI7QUFDRCxTQUpELE1BSU87QUFDTDVELFVBQUFBLEtBQUssQ0FBQywrQkFBRCxFQUFrQzRELE1BQWxDLENBQUw7QUFDRDtBQUNGOztBQUNELFlBQU1xQyxVQUFVLEdBQUdDLHVCQUFXYixNQUFYLENBQWtCekIsTUFBbEIsQ0FBbkI7O0FBQ0EsVUFBSXFDLFVBQVUsQ0FBQ0UsTUFBWCxFQUFKLEVBQXlCO0FBQ3ZCbkcsUUFBQUEsS0FBSyxDQUFDLFNBQUQsRUFBWW9HLDJCQUFhQyxNQUFiLENBQW9CSixVQUFwQixDQUFaLENBQUw7QUFDRCxPQUZELE1BRU87QUFDTEwsUUFBQUEsU0FBUyxDQUFDVSxJQUFWLENBQWVMLFVBQVUsQ0FBQ00sS0FBMUI7QUFDRDs7QUFDRCxhQUFPWCxTQUFQO0FBQ0QsS0FyQ0ssRUFxQ0h0RixPQUFPLENBQUNILE9BQVIsQ0FBZ0I2QixLQUFoQixDQXJDRyxDQUFOO0FBc0NBdUQsSUFBQUEsU0FBUyxDQUFDdEUsT0FBVixDQUFtQjBDLElBQUQsSUFBVTtBQUMxQjs7O0FBR0FMLE1BQUFBLFFBQVEsQ0FBQzBDLElBQVQsQ0FBYyxRQUFkLEVBQXdCckMsSUFBeEI7QUFDQTNELE1BQUFBLEtBQUssQ0FBRSxVQUFTMkQsSUFBSSxDQUFDQyxNQUFMLElBQWVELElBQUksQ0FBQ0csUUFBUztFQUNqREgsSUFBSSxDQUFDekMsUUFBTCxJQUFpQnlDLElBQUksQ0FBQ0UsU0FBVSx1QkFBc0JGLElBQUksQ0FBQ21DLE9BQVEsRUFEMUQsQ0FBTDtBQUVBOzs7Ozs7QUFLQW5DLE1BQUFBLElBQUksQ0FBQ3pDLFFBQUwsSUFBaUJvQyxRQUFRLENBQUMwQyxJQUFULENBQWMsUUFBZCxFQUF3QnJDLElBQXhCLENBQWpCO0FBQ0QsS0FiRDtBQWNBLFdBQU8zQixLQUFQO0FBQ0QsR0E3REQsQ0E2REUsT0FBT1AsR0FBUCxFQUFZO0FBQ1p6QixJQUFBQSxLQUFLLENBQUUscUNBQW9DeUIsR0FBRyxDQUFDQyxPQUFKLElBQWVELEdBQUksR0FBekQsQ0FBTDtBQUNBLFdBQU9PLEtBQVA7QUFDRDtBQUNGLEMsQ0FFRDtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBRUE7OztBQUVBLE1BQU1jLE1BQU0sR0FBR3VCLGdCQUFFbUMsUUFBRixDQUFXM0UsYUFBWCxFQUEwQixJQUExQixDQUFmOztlQUVleUIsUSIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE5LiBOYXRhLUluZm9cbiAqIEBhdXRob3IgQW5kcmVpIFNhcmFrZWV2IDxhdnNAbmF0YS1pbmZvLnJ1PlxuICpcbiAqIFRoaXMgZmlsZSBpcyBwYXJ0IG9mIHRoZSBcIkBuYXRhXCIgcHJvamVjdC5cbiAqIEZvciB0aGUgZnVsbCBjb3B5cmlnaHQgYW5kIGxpY2Vuc2UgaW5mb3JtYXRpb24sIHBsZWFzZSB2aWV3XG4gKiB0aGUgRVVMQSBmaWxlIHRoYXQgd2FzIGRpc3RyaWJ1dGVkIHdpdGggdGhpcyBzb3VyY2UgY29kZS5cbiAqL1xuXG4vKiB0c2xpbnQ6ZGlzYWJsZTp2YXJpYWJsZS1uYW1lICovXG5pbXBvcnQgZGVidWdGYWN0b3J5IGZyb20gJ2RlYnVnJztcbmltcG9ydCB7IEV2ZW50RW1pdHRlciB9IGZyb20gJ2V2ZW50cyc7XG5pbXBvcnQgZnMsIHsgU3RhdHMgfSBmcm9tICdmcyc7XG5pbXBvcnQgeyBQYXRoUmVwb3J0ZXIgfSBmcm9tICdpby10cy9saWIvUGF0aFJlcG9ydGVyJztcbmltcG9ydCB5YW1sIGZyb20gJ2pzLXlhbWwnO1xuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCBwYXRoIGZyb20gJ3BhdGgnO1xuaW1wb3J0IFNlcmlhbFBvcnQgZnJvbSAnc2VyaWFscG9ydCc7XG5pbXBvcnQgdXNiRGV0ZWN0aW9uIGZyb20gJ3VzYi1kZXRlY3Rpb24nO1xuaW1wb3J0IHsgSU1pYkRlc2NyaXB0aW9uIH0gZnJvbSAnQG5pYnVzL2NvcmUvbGliL01pYkRlc2NyaXB0aW9uJztcbmltcG9ydCB7XG4gIENhdGVnb3J5LFxuICBDYXRlZ29yeVYsXG4gIEhleE9yTnVtYmVyLFxuICBJS25vd25Qb3J0LFxuICBLbm93blBvcnRWLFxufSBmcm9tICdAbmlidXMvY29yZS9saWIvc2Vzc2lvbi9Lbm93blBvcnRzJztcblxuLy8gbGV0IHVzYkRldGVjdGlvbjogdHlwZW9mIFVzYkRldGVjdGlvbjtcbmNvbnN0IGRlYnVnID0gZGVidWdGYWN0b3J5KCduaWJ1czpkZXRlY3RvcicpO1xuY29uc3QgZGV0ZWN0aW9uUGF0aCA9IHBhdGgucmVzb2x2ZShfX2Rpcm5hbWUsICcuLi8uLi9kZXRlY3Rpb24ueW1sJyk7XG5sZXQga25vd25Qb3J0czogUHJvbWlzZTxJS25vd25Qb3J0W10+ID0gUHJvbWlzZS5yZXNvbHZlKFtdKTtcblxuaW50ZXJmYWNlIElEZXRlY3Rvckl0ZW0ge1xuICBkZXZpY2U6IHN0cmluZztcbiAgdmlkOiBIZXhPck51bWJlcjtcbiAgcGlkOiBIZXhPck51bWJlcjtcbiAgbWFudWZhY3R1cmVyPzogc3RyaW5nO1xuICBzZXJpYWxOdW1iZXI/OiBzdHJpbmc7XG4gIGNhdGVnb3J5OiBDYXRlZ29yeTtcbn1cblxuaW50ZXJmYWNlIElEZXRlY3Rpb24ge1xuICBtaWJDYXRlZ29yaWVzOiB7XG4gICAgW2NhdGVnb3J5OiBzdHJpbmddOiBJTWliRGVzY3JpcHRpb24sXG4gIH07XG4gIGtub3duRGV2aWNlczogSURldGVjdG9ySXRlbVtdO1xufVxuXG5jb25zdCBsb2FkRGV0ZWN0aW9uID0gKCk6IElEZXRlY3Rpb24gfCB1bmRlZmluZWQgPT4ge1xuICB0cnkge1xuICAgIGNvbnN0IGRhdGEgPSBmcy5yZWFkRmlsZVN5bmMoZGV0ZWN0aW9uUGF0aCwgJ3V0ZjgnKTtcbiAgICBjb25zdCByZXN1bHQgPSB5YW1sLnNhZmVMb2FkKGRhdGEpIGFzIElEZXRlY3Rpb247XG4gICAgT2JqZWN0LmtleXMocmVzdWx0Lm1pYkNhdGVnb3JpZXMpLmZvckVhY2goKGNhdGVnb3J5KSA9PiB7XG4gICAgICBjb25zdCBkZXNjID0gcmVzdWx0Lm1pYkNhdGVnb3JpZXNbY2F0ZWdvcnldO1xuICAgICAgZGVzYy5jYXRlZ29yeSA9IGNhdGVnb3J5O1xuICAgICAgaWYgKEFycmF5LmlzQXJyYXkoZGVzYy5zZWxlY3QpKSB7XG4gICAgICAgIGRlc2Muc2VsZWN0ID0gKGRlc2Muc2VsZWN0IGFzIHVua25vd24gYXMgc3RyaW5nW10pXG4gICAgICAgICAgLm1hcChjYXQgPT4gcmVzdWx0Lm1pYkNhdGVnb3JpZXNbY2F0XSB8fCBjYXQpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIHJldHVybiByZXN1bHQ7XG4gIH0gY2F0Y2ggKGVycikge1xuICAgIGRlYnVnKGBFcnJvcjogZmFpbGVkIHRvIHJlYWQgZmlsZSAke2RldGVjdGlvblBhdGh9ICgke2Vyci5tZXNzYWdlfSlgKTtcbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG59O1xuXG5sZXQgZGV0ZWN0aW9uID0gbG9hZERldGVjdGlvbigpO1xuXG5mdW5jdGlvbiByZWxvYWREZXZpY2VzKGxhc3RBZGRlZD86IHVzYkRldGVjdGlvbi5JRGV2aWNlKSB7XG4gIGtub3duUG9ydHMgPSBrbm93blBvcnRzLnRoZW4ocG9ydHMgPT4gcmVsb2FkRGV2aWNlc0FzeW5jKHBvcnRzLCBsYXN0QWRkZWQpKTtcbn1cblxuY29uc3QgZGV0ZWN0aW9uTGlzdGVuZXIgPSAoY3VycjogU3RhdHMsIHByZXY6IFN0YXRzKSA9PiB7XG4gIGlmIChjdXJyLm10aW1lICE9PSBwcmV2Lm10aW1lKSB7XG4gICAgZGVidWcoYGRldGVjdGlvbiBmaWxlIHdhcyBjaGFuZ2VkLCByZWxvYWRpbmcgZGV2aWNlcy4uLmApO1xuICAgIGRldGVjdGlvbiA9IHVuZGVmaW5lZDtcbiAgICByZWxvYWREZXZpY2VzKCk7XG4gIH1cbn07XG5cbi8qKlxuICogQGZpcmVzIGFkZFxuICogQGZpcmVzIHJlbW92ZVxuICogQGZpcmVzIHBsdWdcbiAqIEBmaXJlcyB1bnBsdWdcbiAqL1xuY2xhc3MgRGV0ZWN0b3IgZXh0ZW5kcyBFdmVudEVtaXR0ZXIge1xuICBzdGFydCgpIHtcbiAgICAvLyB1c2JEZXRlY3Rpb24gPSByZXF1aXJlKCd1c2ItZGV0ZWN0aW9uJyk7XG4gICAgdXNiRGV0ZWN0aW9uLnN0YXJ0TW9uaXRvcmluZygpO1xuICAgIGRlYnVnKGBzdGFydCB3YXRjaGluZyB0aGUgZGV0ZWN0b3IgZmlsZSAke2RldGVjdGlvblBhdGh9YCk7XG4gICAgZnMud2F0Y2hGaWxlKGRldGVjdGlvblBhdGgsIHsgcGVyc2lzdGVudDogZmFsc2UgfSwgZGV0ZWN0aW9uTGlzdGVuZXIpO1xuICAgIC8vIGRldGVjdGlvbiA9IGxvYWREZXRlY3Rpb24oKTtcbiAgICByZWxvYWREZXZpY2VzKCk7XG4gICAgLy8g0JTQvtC70LbQvdCwINCx0YvRgtGMIGRlYm91bmNlINGBINC30LDQtNC10YDQttC60L7QuSwg0LjQvdCw0YfQtSBTZXJpYWwubGlzdCDQvdC1INC+0L/RgNC10LTQtdC70LjRglxuICAgIHVzYkRldGVjdGlvbi5vbignYWRkJywgcmVsb2FkKTtcbiAgICAvLyDQo9C00LDQu9C10L3QuNC1INCx0LXQtyDQt9Cw0LTQtdGA0LbQutC4IVxuICAgIHVzYkRldGVjdGlvbi5vbigncmVtb3ZlJywgcmVsb2FkRGV2aWNlcyk7XG4gIH1cblxuICBzdG9wKCkge1xuICAgIGZzLnVud2F0Y2hGaWxlKGRldGVjdGlvblBhdGgsIGRldGVjdGlvbkxpc3RlbmVyKTtcbiAgICB1c2JEZXRlY3Rpb24gJiYgdXNiRGV0ZWN0aW9uLnN0b3BNb25pdG9yaW5nKCk7XG4gIH1cblxuICByZXN0YXJ0KCkge1xuICAgIGlmICghdXNiRGV0ZWN0aW9uKSByZXR1cm4gdGhpcy5zdGFydCgpO1xuICAgIHVzYkRldGVjdGlvbi5zdG9wTW9uaXRvcmluZygpO1xuICAgIHByb2Nlc3MubmV4dFRpY2soKCkgPT4gdXNiRGV0ZWN0aW9uLnN0YXJ0TW9uaXRvcmluZygpKTtcbiAgfVxuXG4gIGFzeW5jIGdldFBvcnRzKCkge1xuICAgIHJldHVybiBrbm93blBvcnRzO1xuICB9XG5cbiAgZ2V0IGRldGVjdGlvbigpOiBJRGV0ZWN0aW9uIHwgdW5kZWZpbmVkIHtcbiAgICByZXR1cm4gZGV0ZWN0aW9uO1xuICB9XG59XG5cbmNvbnN0IGRldGVjdG9yID0gbmV3IERldGVjdG9yKCk7XG5cbi8vIGludGVyZmFjZSBJU2VyaWFsUG9ydCB7XG4vLyAgIGNvbU5hbWU6IHN0cmluZztcbi8vICAgbG9jYXRpb25JZD86IHN0cmluZztcbi8vICAgbWFudWZhY3R1cmVyPzogc3RyaW5nO1xuLy8gICBwbnBJZD86IHN0cmluZztcbi8vICAgcHJvZHVjdElkOiBIZXhPck51bWJlcjtcbi8vICAgc2VyaWFsTnVtYmVyOiBzdHJpbmc7XG4vLyAgIHZlbmRvcklkOiBIZXhPck51bWJlcjtcbi8vIH1cblxuLy8gdHlwZSBPbWl0PFQsIEsgZXh0ZW5kcyBrZXlvZiBUPiA9IFBpY2s8VCwgRXhjbHVkZTxrZXlvZiBULCBLPj47XG4vL1xuLy8gZXhwb3J0IGludGVyZmFjZSBJS25vd25Qb3J0IGV4dGVuZHMgT21pdDxTZXJpYWxQb3J0LlBvcnRJbmZvLCAncHJvZHVjdElkJyB8ICd2ZW5kb3JJZCc+IHtcbi8vICAgZGV2aWNlPzogc3RyaW5nO1xuLy8gICBwcm9kdWN0SWQ6IG51bWJlcjtcbi8vICAgdmVuZG9ySWQ6IG51bWJlcjtcbi8vICAgY2F0ZWdvcnk/OiBzdHJpbmc7XG4vLyB9XG5cbmNvbnN0IGdldElkID0gKGlkPzogSGV4T3JOdW1iZXIpID0+IHR5cGVvZiBpZCA9PT0gJ3N0cmluZycgPyBwYXJzZUludChpZCwgMTYpIDogaWQ7XG5cbmZ1bmN0aW9uIGVxdWFscyhwb3J0OiBTZXJpYWxQb3J0LlBvcnRJbmZvLCBkZXZpY2U6IHVzYkRldGVjdGlvbi5JRGV2aWNlKTogYm9vbGVhbiB7XG4gIHJldHVybiBnZXRJZChwb3J0LnByb2R1Y3RJZCkgPT09IGRldmljZS5wcm9kdWN0SWRcbiAgICAmJiBnZXRJZChwb3J0LnZlbmRvcklkKSA9PT0gZGV2aWNlLnZlbmRvcklkXG4gICAgJiYgcG9ydC5zZXJpYWxOdW1iZXIgPT09IGRldmljZS5zZXJpYWxOdW1iZXI7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGRldGVjdERldmljZShwb3J0OiBTZXJpYWxQb3J0LlBvcnRJbmZvLCBsYXN0QWRkZWQ/OiB1c2JEZXRlY3Rpb24uSURldmljZSlcbiAgOiBQcm9taXNlPElLbm93blBvcnQ+IHtcbiAgbGV0IGRldGVjdGVkOiB1c2JEZXRlY3Rpb24uSURldmljZSB8IHVuZGVmaW5lZDtcbiAgaWYgKGxhc3RBZGRlZCAmJiBlcXVhbHMocG9ydCwgbGFzdEFkZGVkKSkge1xuICAgIGRldGVjdGVkID0gbGFzdEFkZGVkO1xuICB9IGVsc2Uge1xuICAgIGxldCBsaXN0ID0gYXdhaXQgdXNiRGV0ZWN0aW9uLmZpbmQoZ2V0SWQocG9ydC52ZW5kb3JJZCkhLCBnZXRJZChwb3J0LnByb2R1Y3RJZCkhLCAoKSA9PiB7fSk7XG4gICAgY29uc3QgeyBzZXJpYWxOdW1iZXIsIG1hbnVmYWN0dXJlciB9ID0gcG9ydDtcbiAgICBsaXN0ID0gXy5maWx0ZXIoXG4gICAgICBsaXN0LFxuICAgICAge1xuICAgICAgICBzZXJpYWxOdW1iZXIsXG4gICAgICAgIG1hbnVmYWN0dXJlcixcbiAgICAgIH0sXG4gICAgKTtcbiAgICBpZiAobGlzdC5sZW5ndGggPT09IDApIHtcbiAgICAgIGRlYnVnKGBVbmtub3duIGRldmljZSAke0pTT04uc3RyaW5naWZ5KHBvcnQpfWApO1xuICAgIH0gZWxzZSBpZiAobGlzdC5sZW5ndGggPiAxKSB7XG4gICAgICBkZWJ1ZyhgY2FuJ3QgaWRlbnRpZnkgZGV2aWNlICR7SlNPTi5zdHJpbmdpZnkocG9ydCl9YCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIFtkZXRlY3RlZF0gPSBsaXN0O1xuICAgIH1cbiAgfVxuICBpZiAoZGV0ZWN0ZWQgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IHsgcHJvZHVjdElkLCB2ZW5kb3JJZCwgZGV2aWNlTmFtZTogZGV2aWNlLCBkZXZpY2VBZGRyZXNzIH0gPSBkZXRlY3RlZDtcbiAgICByZXR1cm4ge1xuICAgICAgLi4ucG9ydCxcbiAgICAgIHByb2R1Y3RJZCxcbiAgICAgIHZlbmRvcklkLFxuICAgICAgZGV2aWNlLFxuICAgICAgZGV2aWNlQWRkcmVzcyxcbiAgICB9O1xuICB9XG4gIHJldHVybiB7XG4gICAgLi4ucG9ydCxcbiAgICBwcm9kdWN0SWQ6IGdldElkKHBvcnQucHJvZHVjdElkKSEsXG4gICAgdmVuZG9ySWQ6IGdldElkKHBvcnQudmVuZG9ySWQpISxcbiAgfTtcbn1cblxuLy8gY29uc3QgbG9hZERldGVjdGlvbiA9ICgpID0+IG5ldyBQcm9taXNlPElEZXRlY3Rpb24+KChyZXNvbHZlLCByZWplY3QpID0+IHtcbi8vICAgZnMucmVhZEZpbGUoZGV0ZWN0aW9uUGF0aCwgJ3V0ZjgnLCAoZXJyLCBkYXRhKSA9PiB7XG4vLyAgICAgaWYgKGVycikge1xuLy8gICAgICAgcmVqZWN0KGBFcnJvcjogZmFpbGVkIHRvIHJlYWQgZmlsZSAke2RldGVjdGlvblBhdGh9ICgke2Vyci5tZXNzYWdlfSlgKTtcbi8vICAgICB9IGVsc2Uge1xuLy8gICAgICAgY29uc3QgcmVzdWx0ID0geWFtbC5zYWZlTG9hZChkYXRhKSBhcyBJRGV0ZWN0aW9uO1xuLy8gICAgICAgT2JqZWN0LmtleXMocmVzdWx0Lm1pYkNhdGVnb3JpZXMpLmZvckVhY2goKGNhdGVnb3J5KSA9PiB7XG4vLyAgICAgICAgIHJlc3VsdC5taWJDYXRlZ29yaWVzW2NhdGVnb3J5XS5jYXRlZ29yeSA9IGNhdGVnb3J5O1xuLy8gICAgICAgfSk7XG4vLyAgICAgICByZXNvbHZlKHJlc3VsdCk7XG4vLyAgICAgfVxuLy8gICB9KTtcbi8vIH0pO1xuXG5jb25zdCBtYXRjaENhdGVnb3J5ID0gKHBvcnQ6IElLbm93blBvcnQpOiBDYXRlZ29yeSA9PiB7XG4gIGNvbnN0IG1hdGNoID0gZGV0ZWN0aW9uICYmIF8uZmluZChcbiAgICBkZXRlY3Rpb24hLmtub3duRGV2aWNlcyxcbiAgICBpdGVtID0+ICghaXRlbS5kZXZpY2UgfHwgKHBvcnQuZGV2aWNlICYmIHBvcnQuZGV2aWNlLnN0YXJ0c1dpdGgoaXRlbS5kZXZpY2UpKSlcbiAgICAgICYmICghaXRlbS5zZXJpYWxOdW1iZXJcbiAgICAgICAgfHwgKHBvcnQuc2VyaWFsTnVtYmVyICYmIHBvcnQuc2VyaWFsTnVtYmVyLnN0YXJ0c1dpdGgoaXRlbS5zZXJpYWxOdW1iZXIpKSlcbiAgICAgICYmICghaXRlbS5tYW51ZmFjdHVyZXIgfHwgKHBvcnQubWFudWZhY3R1cmVyID09PSBpdGVtLm1hbnVmYWN0dXJlcikpXG4gICAgICAmJiAoZ2V0SWQoaXRlbS52aWQpID09PSBwb3J0LnZlbmRvcklkKSAmJiAoZ2V0SWQoaXRlbS5waWQpID09PSBwb3J0LnByb2R1Y3RJZCksXG4gICkgYXMgSURldGVjdG9ySXRlbTtcbiAgaWYgKCFtYXRjaCAmJiBwcm9jZXNzLnBsYXRmb3JtID09PSAnd2luMzInXG4gICAgJiYgKHBvcnQucHJvZHVjdElkID09PSAweDYwMDEgfHwgcG9ydC5wcm9kdWN0SWQgPT09IDB4NjAxNSlcbiAgICAmJiBwb3J0LnZlbmRvcklkID09PSAweDA0MDMpIHtcbiAgICByZXR1cm4gJ2Z0ZGknO1xuICB9XG4gIGlmIChtYXRjaCkgcmV0dXJuIENhdGVnb3J5Vi5kZWNvZGUobWF0Y2guY2F0ZWdvcnkpLmdldE9yRWxzZSh1bmRlZmluZWQpO1xufTtcblxuYXN5bmMgZnVuY3Rpb24gcmVsb2FkRGV2aWNlc0FzeW5jKHByZXZQb3J0czogSUtub3duUG9ydFtdLCBsYXN0QWRkZWQ/OiB1c2JEZXRlY3Rpb24uSURldmljZSkge1xuICBjb25zdCBwb3J0czogSUtub3duUG9ydFtdID0gW107XG4gIHRyeSB7XG4gICAgaWYgKGRldGVjdGlvbiA9PSBudWxsKSB7XG4gICAgICBkZXRlY3Rpb24gPSBsb2FkRGV0ZWN0aW9uKCk7XG4gICAgfVxuICAgIGNvbnN0IGxpc3Q6IFNlcmlhbFBvcnQuUG9ydEluZm9bXSA9IGF3YWl0IFNlcmlhbFBvcnQubGlzdCgpO1xuICAgIGNvbnN0IGV4dGVybmFsUG9ydHMgPSBsaXN0LmZpbHRlcihwb3J0ID0+ICEhcG9ydC5wcm9kdWN0SWQpO1xuICAgIC8vIGNvbnN0IHByZXZQb3J0cyA9IGtub3duUG9ydHMuc3BsaWNlKDApO1xuXG4gICAgYXdhaXQgZXh0ZXJuYWxQb3J0cy5yZWR1Y2UoYXN5bmMgKHByb21pc2UsIHBvcnQpID0+IHtcbiAgICAgIGNvbnN0IG5leHRQb3J0cyA9IGF3YWl0IHByb21pc2U7XG4gICAgICBjb25zdCBwcmV2ID0gXy5maW5kSW5kZXgocHJldlBvcnRzLCB7IGNvbU5hbWU6IHBvcnQuY29tTmFtZSB9KTtcbiAgICAgIGxldCBkZXZpY2U6IElLbm93blBvcnQ7XG4gICAgICBpZiAocHJldiAhPT0gLTEpIHtcbiAgICAgICAgW2RldmljZV0gPSBwcmV2UG9ydHMuc3BsaWNlKHByZXYsIDEpO1xuICAgICAgICBjb25zdCBjYXRlZ29yeSA9IG1hdGNoQ2F0ZWdvcnkoZGV2aWNlKTtcbiAgICAgICAgaWYgKGNhdGVnb3J5ICE9PSBkZXZpY2UuY2F0ZWdvcnkpIHtcbiAgICAgICAgICBkZWJ1ZyhgZGV2aWNlJ3MgY2F0ZWdvcnkgd2FzIGNoYW5nZWQgJHtkZXZpY2UuY2F0ZWdvcnl9IHRvICR7Y2F0ZWdvcnl9YCk7XG4gICAgICAgICAgZGV2aWNlLmNhdGVnb3J5ICYmIGRldGVjdG9yLmVtaXQoJ3JlbW92ZScsIGRldmljZSk7XG4gICAgICAgICAgZGV2aWNlLmNhdGVnb3J5ID0gQ2F0ZWdvcnlWLmRlY29kZShjYXRlZ29yeSkuZ2V0T3JFbHNlKHVuZGVmaW5lZCk7XG4gICAgICAgICAgZGV2aWNlLmNhdGVnb3J5ICYmIGRldGVjdG9yLmVtaXQoJ2FkZCcsIGRldmljZSk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGRldmljZSA9IGF3YWl0IGRldGVjdERldmljZShwb3J0LCBsYXN0QWRkZWQpO1xuICAgICAgICBkZXZpY2UuY2F0ZWdvcnkgPSBtYXRjaENhdGVnb3J5KGRldmljZSk7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiBuZXcgZGV2aWNlIHBsdWdnZWRcbiAgICAgICAgICogQGV2ZW50IERldGVjdG9yI3BsdWdcbiAgICAgICAgICovXG4gICAgICAgIGRldGVjdG9yLmVtaXQoJ3BsdWcnLCBkZXZpY2UpO1xuICAgICAgICAvLyBjb25zb2xlLmxvZygnUE9SVCcsIEpTT04uc3RyaW5naWZ5KHBvcnQpKTtcbiAgICAgICAgaWYgKGRldmljZS5jYXRlZ29yeSkge1xuICAgICAgICAgIGRlYnVnKGBuZXcgZGV2aWNlICR7ZGV2aWNlLmRldmljZSB8fCBkZXZpY2UudmVuZG9ySWR9L1xcXG4ke2RldmljZS5jYXRlZ29yeX0gd2FzIHBsdWdnZWQgdG8gJHtkZXZpY2UuY29tTmFtZX1gKTtcbiAgICAgICAgICBkZXRlY3Rvci5lbWl0KCdhZGQnLCBkZXZpY2UpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGRlYnVnKCd1bmtub3duIGRldmljZSAlbyB3YXMgcGx1Z2dlZCcsIGRldmljZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGNvbnN0IHZhbGlkYXRpb24gPSBLbm93blBvcnRWLmRlY29kZShkZXZpY2UpO1xuICAgICAgaWYgKHZhbGlkYXRpb24uaXNMZWZ0KCkpIHtcbiAgICAgICAgZGVidWcoJzxlcnJvcj4nLCBQYXRoUmVwb3J0ZXIucmVwb3J0KHZhbGlkYXRpb24pKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5leHRQb3J0cy5wdXNoKHZhbGlkYXRpb24udmFsdWUpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG5leHRQb3J0cztcbiAgICB9LCBQcm9taXNlLnJlc29sdmUocG9ydHMpKTtcbiAgICBwcmV2UG9ydHMuZm9yRWFjaCgocG9ydCkgPT4ge1xuICAgICAgLyoqXG4gICAgICAgKiBAZXZlbnQgRGV0ZWN0b3IjdW5wbHVnXG4gICAgICAgKi9cbiAgICAgIGRldGVjdG9yLmVtaXQoJ3VucGx1ZycsIHBvcnQpO1xuICAgICAgZGVidWcoYGRldmljZSAke3BvcnQuZGV2aWNlIHx8IHBvcnQudmVuZG9ySWR9L1xcXG4ke3BvcnQuY2F0ZWdvcnkgfHwgcG9ydC5wcm9kdWN0SWR9IHdhcyB1bnBsdWdnZWQgZnJvbSAke3BvcnQuY29tTmFtZX1gKTtcbiAgICAgIC8qKlxuICAgICAgICogZGV2aWNlIHdpdGggY2F0ZWdvcnkgd2FzIHJlbW92ZWRcbiAgICAgICAqIEBldmVudCBEZXRlY3RvciNyZW1vdmVcbiAgICAgICAqIEBwYXJhbSB7SUtub3duUG9ydH0gZGV2aWNlXG4gICAgICAgKi9cbiAgICAgIHBvcnQuY2F0ZWdvcnkgJiYgZGV0ZWN0b3IuZW1pdCgncmVtb3ZlJywgcG9ydCk7XG4gICAgfSk7XG4gICAgcmV0dXJuIHBvcnRzO1xuICB9IGNhdGNoIChlcnIpIHtcbiAgICBkZWJ1ZyhgRXJyb3I6IHJlbG9hZCBkZXZpY2VzIHdhcyBmYWlsZWQgKCR7ZXJyLm1lc3NhZ2UgfHwgZXJyfSlgKTtcbiAgICByZXR1cm4gcG9ydHM7XG4gIH1cbn1cblxuLy8gZGVidWcoYHN0YXJ0IHdhdGNoaW5nIHRoZSBkZXRlY3RvciBmaWxlICR7ZGV0ZWN0aW9uUGF0aH1gKTtcbi8vIGZzLndhdGNoRmlsZShkZXRlY3Rpb25QYXRoLCB7IHBlcnNpc3RlbnQ6IGZhbHNlIH0sIChjdXJyLCBwcmV2KSA9PiB7XG4vLyAgIGlmIChjdXJyLm10aW1lICE9PSBwcmV2Lm10aW1lKSB7XG4vLyAgICAgZGVidWcoYGRldGVjdGlvbiBmaWxlIHdhcyBjaGFuZ2VkLCByZWxvYWRpbmcgZGV2aWNlcy4uLmApO1xuLy8gICAgIGRldGVjdGlvbiA9IHVuZGVmaW5lZDtcbi8vICAgICByZWxvYWREZXZpY2VzKCkuY2F0Y2goKTtcbi8vICAgfVxuLy8gfSk7XG5cbi8vIHJlbG9hZERldmljZXMoKTtcblxuY29uc3QgcmVsb2FkID0gXy5kZWJvdW5jZShyZWxvYWREZXZpY2VzLCAyMDAwKTtcblxuZXhwb3J0IGRlZmF1bHQgZGV0ZWN0b3I7XG4iXX0=