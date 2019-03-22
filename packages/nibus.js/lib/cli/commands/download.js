"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.action = action;
exports.default = exports.convert = void 0;

var _fs = _interopRequireDefault(require("fs"));

var _progress = _interopRequireDefault(require("progress"));

var _handlers = require("../handlers");

var _write = require("./write");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function readAllFromStdin() {
  const buffers = []; // let rest = max;

  const onData = buffer => {
    // if (rest <= 0) return;
    buffers.push(buffer); // rest -= buffer.length;
  };

  return new Promise((resolve, reject) => {
    process.stdin.on('data', onData).once('end', () => {
      process.stdin.off('data', onData);
      process.stdin.off('error', reject);
      resolve(Buffer.concat(buffers));
    }).once('error', reject);
  });
}

const convert = buffer => {
  const lines = buffer.toString('ascii').split(/\r?\n/g);
  let offset = 0;
  if (lines.length === 0) return [Buffer.alloc(0), 0];
  const first = lines[0];
  let start = 0;

  if (first[0] === '@') {
    offset = parseInt(first.slice(1), 16);
    start = 1;
  }

  const hexToBuf = hex => Buffer.from(hex.split(/[\s:-=]/g).join(''), 'hex');

  return [Buffer.concat(lines.slice(start).map(hexToBuf)), offset];
};

exports.convert = convert;

async function action(device, args) {
  const {
    domain,
    offset,
    source,
    hex
  } = args;
  await (0, _write.action)(device, args);
  let buffer;
  let ofs = 0;

  let tick = size => {};

  if (source) {
    buffer = await _fs.default.promises.readFile(source);
    if (hex) [buffer, ofs] = convert(buffer);
    const dest = (offset || ofs).toString(16).padStart(4, '0');
    const bar = new _progress.default(`  downloading [:bar] to ${dest} :rate/bps :percent :current/:total :etas`, {
      total: buffer.length,
      width: 20
    });
    tick = bar.tick.bind(bar);
  } else {
    buffer = await readAllFromStdin();

    if (hex) {
      [buffer, ofs] = convert(buffer);
    }
  }

  device.on('downloadData', ({
    domain: dataDomain,
    length
  }) => {
    if (dataDomain === domain) tick(length);
  });
  await device.download(domain, buffer, offset || ofs);
}

const downloadCommand = {
  command: 'download',
  describe: 'загрузить домен в устройство',
  builder: argv => argv.option('domain', {
    default: 'CODE',
    describe: 'имя домена',
    string: true
  }).option('offset', {
    alias: 'ofs',
    default: 0,
    number: true,
    describe: 'смещение в домене'
  }).option('source', {
    alias: 'src',
    string: true,
    describe: 'загрузить данные из файла'
  }).option('hex', {
    boolean: true,
    describe: 'использовать текстовый формат'
  }).check(({
    hex,
    raw
  }) => {
    if (hex && raw) throw new Error('Arguments hex and raw are mutually exclusive');
    return true;
  }).demandOption(['m', 'mac']),
  handler: (0, _handlers.makeAddressHandler)(action, true)
};
var _default = downloadCommand;
exports.default = _default;