"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createNmsRead = createNmsRead;
exports.createNmsWrite = createNmsWrite;
exports.createNmsInitiateUploadSequence = createNmsInitiateUploadSequence;
exports.createNmsRequestDomainUpload = createNmsRequestDomainUpload;
exports.createNmsUploadSegment = createNmsUploadSegment;
exports.createNmsRequestDomainDownload = createNmsRequestDomainDownload;
exports.createNmsInitiateDownloadSequence = createNmsInitiateDownloadSequence;
exports.createNmsDownloadSegment = createNmsDownloadSegment;
exports.createNmsTerminateDownloadSequence = createNmsTerminateDownloadSequence;
exports.createNmsVerifyDomainChecksum = createNmsVerifyDomainChecksum;
exports.createExecuteProgramInvocation = createExecuteProgramInvocation;
Object.defineProperty(exports, "getNmsType", {
  enumerable: true,
  get: function () {
    return _nms.getNmsType;
  }
});
Object.defineProperty(exports, "NmsDatagram", {
  enumerable: true,
  get: function () {
    return _NmsDatagram.default;
  }
});
Object.defineProperty(exports, "NmsServiceType", {
  enumerable: true,
  get: function () {
    return _NmsServiceType.default;
  }
});
Object.defineProperty(exports, "NmsValueType", {
  enumerable: true,
  get: function () {
    return _NmsValueType.default;
  }
});

require("source-map-support/register");

var _lodash = _interopRequireDefault(require("lodash"));

var _nbconst = require("../nbconst");

var _nibus = require("../nibus");

var _nms = require("./nms");

var _NmsDatagram = _interopRequireDefault(require("./NmsDatagram"));

var _NmsServiceType = _interopRequireDefault(require("./NmsServiceType"));

var _NmsValueType = _interopRequireDefault(require("./NmsValueType"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

/*
 * @license
 * Copyright (c) 2019. OOO Nata-Info
 * @author Andrei Sarakeev <avs@nata-info.ru>
 *
 * This file is part of the "@nata" project.
 * For the full copyright and license information, please view
 * the EULA file that was distributed with this source code.
 */
function createNmsRead(destination, ...ids) {
  if (ids.length > 21) {
    throw new Error('To many properties (21)');
  }

  const [id, ...rest] = ids;

  const nms = _lodash.default.flatten(rest.map(next => [_NmsServiceType.default.Read << 3 | next >> 8, next & 0xff, 0]));

  return new _NmsDatagram.default({
    destination,
    id,
    notReply: false,
    nms: Buffer.from(nms),
    service: _NmsServiceType.default.Read
  });
}

function createNmsWrite(destination, id, type, value, notReply = false) {
  const nms = (0, _nms.encodeValue)(type, value);
  return new _NmsDatagram.default({
    destination,
    id,
    notReply,
    nms,
    service: _NmsServiceType.default.Write
  });
}

function createNmsInitiateUploadSequence(destination, id) {
  return new _NmsDatagram.default({
    destination,
    id,
    service: _NmsServiceType.default.InitiateUploadSequence
  });
}

function createNmsRequestDomainUpload(destination, domain) {
  if (domain.length !== 8) {
    throw new Error('domain must be string of 8 characters');
  }

  return new _NmsDatagram.default({
    destination,
    id: 0,
    nms: Buffer.from(domain, 'ascii'),
    service: _NmsServiceType.default.RequestDomainUpload
  });
}

function createNmsUploadSegment(destination, id, offset, length) {
  if (offset < 0) {
    throw new Error('Invalid offset');
  }

  if (length < 0 || 255 < length) {
    throw new Error('Invalid length');
  }

  const nms = Buffer.alloc(5);
  nms.writeUInt32LE(offset, 0);
  nms.writeUInt8(length, 4);
  return new _NmsDatagram.default({
    destination,
    id,
    nms,
    service: _NmsServiceType.default.UploadSegment
  });
}

function createNmsRequestDomainDownload(destination, domain) {
  if (domain.length !== 8) {
    throw new Error('domain must be string of 8 characters');
  }

  return new _NmsDatagram.default({
    destination,
    id: 0,
    nms: Buffer.from(domain, 'ascii'),
    service: _NmsServiceType.default.RequestDomainDownload
  });
}

function createNmsInitiateDownloadSequence(destination, id) {
  return new _NmsDatagram.default({
    destination,
    id,
    service: _NmsServiceType.default.InitiateDownloadSequence,
    timeout: 5 * (0, _nibus.getNibusTimeout)()
  });
}

function createNmsDownloadSegment(destination, id, offset, data) {
  if (offset < 0) {
    throw new Error('Invalid offset');
  }

  const max = _nbconst.NMS_MAX_DATA_LENGTH - 4;

  if (data.length > max) {
    throw new Error(`Too big data. No more than ${max} bytes at a time`);
  }

  const ofs = Buffer.alloc(4, 0, 'binary');
  ofs.writeUInt32LE(offset, 0);
  return new _NmsDatagram.default({
    destination,
    id,
    nms: Buffer.concat([ofs, data]),
    service: _NmsServiceType.default.DownloadSegment
  });
}

function createNmsTerminateDownloadSequence(destination, id) {
  return new _NmsDatagram.default({
    destination,
    id,
    service: _NmsServiceType.default.TerminateDownloadSequence,
    timeout: (0, _nibus.getNibusTimeout)() * 6
  });
}

function createNmsVerifyDomainChecksum(destination, id, offset, size, crc) {
  if (offset < 0) {
    throw new Error('Invalid offset');
  }

  if (size < 0) {
    throw new Error('Invalid size');
  }

  const nms = Buffer.alloc(10, 0, 'binary');
  nms.writeUInt32LE(offset, 0);
  nms.writeUInt32LE(size, 4);
  nms.writeUInt16LE(crc, 8);
  return new _NmsDatagram.default({
    destination,
    id,
    nms,
    service: _NmsServiceType.default.VerifyDomainChecksum,
    timeout: (0, _nibus.getNibusTimeout)() * 3
  });
}

function createExecuteProgramInvocation(destination, id, notReply = false, ...args) {
  let nms = Buffer.alloc(0);

  if (args.length > 0) {
    const size = args.reduce((len, [type, value]) => len + (0, _nms.getSizeOf)(type, value), 1);
    nms = Buffer.alloc(size);
    let pos = nms.writeUInt8(args.length, 0);
    args.forEach(([type, value]) => {
      pos = (0, _nms.writeValue)(type, value, nms, pos);
    });
  }

  return new _NmsDatagram.default({
    destination,
    id,
    nms,
    notReply,
    service: _NmsServiceType.default.ExecuteProgramInvocation,
    timeout: (0, _nibus.getNibusTimeout)() * 3
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9ubXMvaW5kZXgudHMiXSwibmFtZXMiOlsiY3JlYXRlTm1zUmVhZCIsImRlc3RpbmF0aW9uIiwiaWRzIiwibGVuZ3RoIiwiRXJyb3IiLCJpZCIsInJlc3QiLCJubXMiLCJfIiwiZmxhdHRlbiIsIm1hcCIsIm5leHQiLCJObXNTZXJ2aWNlVHlwZSIsIlJlYWQiLCJObXNEYXRhZ3JhbSIsIm5vdFJlcGx5IiwiQnVmZmVyIiwiZnJvbSIsInNlcnZpY2UiLCJjcmVhdGVObXNXcml0ZSIsInR5cGUiLCJ2YWx1ZSIsIldyaXRlIiwiY3JlYXRlTm1zSW5pdGlhdGVVcGxvYWRTZXF1ZW5jZSIsIkluaXRpYXRlVXBsb2FkU2VxdWVuY2UiLCJjcmVhdGVObXNSZXF1ZXN0RG9tYWluVXBsb2FkIiwiZG9tYWluIiwiUmVxdWVzdERvbWFpblVwbG9hZCIsImNyZWF0ZU5tc1VwbG9hZFNlZ21lbnQiLCJvZmZzZXQiLCJhbGxvYyIsIndyaXRlVUludDMyTEUiLCJ3cml0ZVVJbnQ4IiwiVXBsb2FkU2VnbWVudCIsImNyZWF0ZU5tc1JlcXVlc3REb21haW5Eb3dubG9hZCIsIlJlcXVlc3REb21haW5Eb3dubG9hZCIsImNyZWF0ZU5tc0luaXRpYXRlRG93bmxvYWRTZXF1ZW5jZSIsIkluaXRpYXRlRG93bmxvYWRTZXF1ZW5jZSIsInRpbWVvdXQiLCJjcmVhdGVObXNEb3dubG9hZFNlZ21lbnQiLCJkYXRhIiwibWF4IiwiTk1TX01BWF9EQVRBX0xFTkdUSCIsIm9mcyIsImNvbmNhdCIsIkRvd25sb2FkU2VnbWVudCIsImNyZWF0ZU5tc1Rlcm1pbmF0ZURvd25sb2FkU2VxdWVuY2UiLCJUZXJtaW5hdGVEb3dubG9hZFNlcXVlbmNlIiwiY3JlYXRlTm1zVmVyaWZ5RG9tYWluQ2hlY2tzdW0iLCJzaXplIiwiY3JjIiwid3JpdGVVSW50MTZMRSIsIlZlcmlmeURvbWFpbkNoZWNrc3VtIiwiY3JlYXRlRXhlY3V0ZVByb2dyYW1JbnZvY2F0aW9uIiwiYXJncyIsInJlZHVj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Q2MsS0FBUCxDQUFhbUIsSUFBYixDQUFOO0FBQ0EsUUFBSVEsR0FBRyxHQUFHbEQsR0FBRyxDQUFDeUIsVUFBSixDQUFlc0IsSUFBSSxDQUFDbkQsTUFBcEIsRUFBNEIsQ0FBNUIsQ0FBVjtBQUNBbUQsSUFBQUEsSUFBSSxDQUFDSSxPQUFMLENBQWEsQ0FBQyxDQUFDdEMsSUFBRCxFQUFPQyxLQUFQLENBQUQsS0FBbUI7QUFDOUJvQyxNQUFBQSxHQUFHLEdBQUcscUJBQVdyQyxJQUFYLEVBQWlCQyxLQUFqQixFQUF3QmQsR0FBeEIsRUFBOEJrRCxHQUE5QixDQUFOO0FBQ0QsS0FGRDtBQUdEOztBQUNELFNBQU8sSUFBSTNDLG9CQUFKLENBQWdCO0FBQ3JCYixJQUFBQSxXQURxQjtBQUVyQkksSUFBQUEsRUFGcUI7QUFHckJFLElBQUFBLEdBSHFCO0FBSXJCUSxJQUFBQSxRQUpxQjtBQUtyQkcsSUFBQUEsT0FBTyxFQUFFTix3QkFBZStDLHdCQUxIO0FBTXJCckIsSUFBQUEsT0FBTyxFQUFFLGdDQUFvQjtBQU5SLEdBQWhCLENBQVA7QUFRRCIsInNvdXJjZXNDb250ZW50IjpbIi8qXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IChjKSAyMDE5LiBPT08gTmF0YS1JbmZvXG4gKiBAYXV0aG9yIEFuZHJlaSBTYXJha2VldiA8YXZzQG5hdGEtaW5mby5ydT5cbiAqXG4gKiBUaGlzIGZpbGUgaXMgcGFydCBvZiB0aGUgXCJAbmF0YVwiIHByb2plY3QuXG4gKiBGb3IgdGhlIGZ1bGwgY29weXJpZ2h0IGFuZCBsaWNlbnNlIGluZm9ybWF0aW9uLCBwbGVhc2Ugdmlld1xuICogdGhlIEVVTEEgZmlsZSB0aGF0IHdhcyBkaXN0cmlidXRlZCB3aXRoIHRoaXMgc291cmNlIGNvZGUuXG4gKi9cblxuaW1wb3J0IF8gZnJvbSAnbG9kYXNoJztcbmltcG9ydCB7IEFkZHJlc3NQYXJhbSB9IGZyb20gJy4uL0FkZHJlc3MnO1xuaW1wb3J0IHsgTk1TX01BWF9EQVRBX0xFTkdUSCB9IGZyb20gJy4uL25iY29uc3QnO1xuaW1wb3J0IHsgZ2V0TmlidXNUaW1lb3V0IH0gZnJvbSAnLi4vbmlidXMnO1xuaW1wb3J0IHsgZW5jb2RlVmFsdWUsIGdldE5tc1R5cGUsIGdldFNpemVPZiwgd3JpdGVWYWx1ZSB9IGZyb20gJy4vbm1zJztcbmltcG9ydCBObXNEYXRhZ3JhbSBmcm9tICcuL05tc0RhdGFncmFtJztcbmltcG9ydCBObXNTZXJ2aWNlVHlwZSBmcm9tICcuL05tc1NlcnZpY2VUeXBlJztcbmltcG9ydCBObXNWYWx1ZVR5cGUgZnJvbSAnLi9ObXNWYWx1ZVR5cGUnO1xuXG5leHBvcnQgeyBObXNTZXJ2aWNlVHlwZSB9O1xuZXhwb3J0IHsgTm1zVmFsdWVUeXBlIH07XG5leHBvcnQgeyBObXNEYXRhZ3JhbSB9O1xuZXhwb3J0IHsgZ2V0Tm1zVHlwZSB9O1xuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTm1zUmVhZChkZXN0aW5hdGlvbjogQWRkcmVzc1BhcmFtLCAuLi5pZHM6IG51bWJlcltdKSB7XG4gIGlmIChpZHMubGVuZ3RoID4gMjEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ1RvIG1hbnkgcHJvcGVydGllcyAoMjEpJyk7XG4gIH1cbiAgY29uc3QgW2lkLCAuLi5yZXN0XSA9IGlkcztcbiAgY29uc3Qgbm1zID0gXy5mbGF0dGVuKHJlc3QubWFwKG5leHQgPT4gW1xuICAgIE5tc1NlcnZpY2VUeXBlLlJlYWQgPDwgMyB8IG5leHQgPj4gOCxcbiAgICBuZXh0ICYgMHhmZixcbiAgICAwLFxuICBdKSk7XG4gIHJldHVybiBuZXcgTm1zRGF0YWdyYW0oe1xuICAgIGRlc3RpbmF0aW9uLFxuICAgIGlkLFxuICAgIG5vdFJlcGx5OiBmYWxzZSxcbiAgICBubXM6IEJ1ZmZlci5mcm9tKG5tcyksXG4gICAgc2VydmljZTogTm1zU2VydmljZVR5cGUuUmVhZCxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVObXNXcml0ZShcbiAgZGVzdGluYXRpb246IEFkZHJlc3NQYXJhbSwgaWQ6IG51bWJlciwgdHlwZTogTm1zVmFsdWVUeXBlLCB2YWx1ZTogYW55LCBub3RSZXBseSA9IGZhbHNlKSB7XG4gIGNvbnN0IG5tcyA9IGVuY29kZVZhbHVlKHR5cGUsIHZhbHVlKTtcbiAgcmV0dXJuIG5ldyBObXNEYXRhZ3JhbSh7XG4gICAgZGVzdGluYXRpb24sXG4gICAgaWQsXG4gICAgbm90UmVwbHksXG4gICAgbm1zLFxuICAgIHNlcnZpY2U6IE5tc1NlcnZpY2VUeXBlLldyaXRlLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU5tc0luaXRpYXRlVXBsb2FkU2VxdWVuY2UoZGVzdGluYXRpb246IEFkZHJlc3NQYXJhbSwgaWQ6IG51bWJlcikge1xuICByZXR1cm4gbmV3IE5tc0RhdGFncmFtKHtcbiAgICBkZXN0aW5hdGlvbixcbiAgICBpZCxcbiAgICBzZXJ2aWNlOiBObXNTZXJ2aWNlVHlwZS5Jbml0aWF0ZVVwbG9hZFNlcXVlbmNlLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU5tc1JlcXVlc3REb21haW5VcGxvYWQoZGVzdGluYXRpb246IEFkZHJlc3NQYXJhbSwgZG9tYWluOiBzdHJpbmcpIHtcbiAgaWYgKGRvbWFpbi5sZW5ndGggIT09IDgpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ2RvbWFpbiBtdXN0IGJlIHN0cmluZyBvZiA4IGNoYXJhY3RlcnMnKTtcbiAgfVxuICByZXR1cm4gbmV3IE5tc0RhdGFncmFtKHtcbiAgICBkZXN0aW5hdGlvbixcbiAgICBpZDogMCxcbiAgICBubXM6IEJ1ZmZlci5mcm9tKGRvbWFpbiwgJ2FzY2lpJyksXG4gICAgc2VydmljZTogTm1zU2VydmljZVR5cGUuUmVxdWVzdERvbWFpblVwbG9hZCxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVObXNVcGxvYWRTZWdtZW50KFxuICBkZXN0aW5hdGlvbjogQWRkcmVzc1BhcmFtLCBpZDogbnVtYmVyLCBvZmZzZXQ6IG51bWJlciwgbGVuZ3RoOiBudW1iZXIpIHtcbiAgaWYgKG9mZnNldCA8IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ludmFsaWQgb2Zmc2V0Jyk7XG4gIH1cbiAgaWYgKGxlbmd0aCA8IDAgfHwgMjU1IDwgbGVuZ3RoKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxlbmd0aCcpO1xuICB9XG4gIGNvbnN0IG5tcyA9IEJ1ZmZlci5hbGxvYyg1KTtcbiAgbm1zLndyaXRlVUludDMyTEUob2Zmc2V0LCAwKTtcbiAgbm1zLndyaXRlVUludDgobGVuZ3RoLCA0KTtcbiAgcmV0dXJuIG5ldyBObXNEYXRhZ3JhbSh7XG4gICAgZGVzdGluYXRpb24sXG4gICAgaWQsXG4gICAgbm1zLFxuICAgIHNlcnZpY2U6IE5tc1NlcnZpY2VUeXBlLlVwbG9hZFNlZ21lbnQsXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTm1zUmVxdWVzdERvbWFpbkRvd25sb2FkKGRlc3RpbmF0aW9uOiBBZGRyZXNzUGFyYW0sIGRvbWFpbjogc3RyaW5nKSB7XG4gIGlmIChkb21haW4ubGVuZ3RoICE9PSA4KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdkb21haW4gbXVzdCBiZSBzdHJpbmcgb2YgOCBjaGFyYWN0ZXJzJyk7XG4gIH1cbiAgcmV0dXJuIG5ldyBObXNEYXRhZ3JhbSh7XG4gICAgZGVzdGluYXRpb24sXG4gICAgaWQ6IDAsXG4gICAgbm1zOiBCdWZmZXIuZnJvbShkb21haW4sICdhc2NpaScpLFxuICAgIHNlcnZpY2U6IE5tc1NlcnZpY2VUeXBlLlJlcXVlc3REb21haW5Eb3dubG9hZCxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVObXNJbml0aWF0ZURvd25sb2FkU2VxdWVuY2UoZGVzdGluYXRpb246IEFkZHJlc3NQYXJhbSwgaWQ6IG51bWJlcikge1xuICByZXR1cm4gbmV3IE5tc0RhdGFncmFtKHtcbiAgICBkZXN0aW5hdGlvbixcbiAgICBpZCxcbiAgICBzZXJ2aWNlOiBObXNTZXJ2aWNlVHlwZS5Jbml0aWF0ZURvd25sb2FkU2VxdWVuY2UsXG4gICAgdGltZW91dDogNSAqIGdldE5pYnVzVGltZW91dCgpLFxuICB9KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZU5tc0Rvd25sb2FkU2VnbWVudChcbiAgZGVzdGluYXRpb246IEFkZHJlc3NQYXJhbSxcbiAgaWQ6IG51bWJlcixcbiAgb2Zmc2V0OiBudW1iZXIsXG4gIGRhdGE6IEJ1ZmZlcikge1xuICBpZiAob2Zmc2V0IDwgMCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBvZmZzZXQnKTtcbiAgfVxuICBjb25zdCBtYXggPSBOTVNfTUFYX0RBVEFfTEVOR1RIIC0gNDtcbiAgaWYgKGRhdGEubGVuZ3RoID4gbWF4KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBUb28gYmlnIGRhdGEuIE5vIG1vcmUgdGhhbiAke21heH0gYnl0ZXMgYXQgYSB0aW1lYCk7XG4gIH1cbiAgY29uc3Qgb2ZzID0gQnVmZmVyLmFsbG9jKDQsIDAsICdiaW5hcnknKTtcbiAgb2ZzLndyaXRlVUludDMyTEUob2Zmc2V0LCAwKTtcblxuICByZXR1cm4gbmV3IE5tc0RhdGFncmFtKHtcbiAgICBkZXN0aW5hdGlvbixcbiAgICBpZCxcbiAgICBubXM6IEJ1ZmZlci5jb25jYXQoW29mcywgZGF0YV0pLFxuICAgIHNlcnZpY2U6IE5tc1NlcnZpY2VUeXBlLkRvd25sb2FkU2VnbWVudCxcbiAgfSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVObXNUZXJtaW5hdGVEb3dubG9hZFNlcXVlbmNlKGRlc3RpbmF0aW9uOiBBZGRyZXNzUGFyYW0sIGlkOiBudW1iZXIpIHtcbiAgcmV0dXJuIG5ldyBObXNEYXRhZ3JhbSh7XG4gICAgZGVzdGluYXRpb24sXG4gICAgaWQsXG4gICAgc2VydmljZTogTm1zU2VydmljZVR5cGUuVGVybWluYXRlRG93bmxvYWRTZXF1ZW5jZSxcbiAgICB0aW1lb3V0OiBnZXROaWJ1c1RpbWVvdXQoKSAqIDYsXG4gIH0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlTm1zVmVyaWZ5RG9tYWluQ2hlY2tzdW0oXG4gIGRlc3RpbmF0aW9uOiBBZGRyZXNzUGFyYW0sXG4gIGlkOiBudW1iZXIsXG4gIG9mZnNldDogbnVtYmVyLFxuICBzaXplOiBudW1iZXIsXG4gIGNyYzogbnVtYmVyKSB7XG4gIGlmIChvZmZzZXQgPCAwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIG9mZnNldCcpO1xuICB9XG4gIGlmIChzaXplIDwgMCkge1xuICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBzaXplJyk7XG4gIH1cbiAgY29uc3Qgbm1zID0gQnVmZmVyLmFsbG9jKDEwLCAwLCAnYmluYXJ5Jyk7XG4gIG5tcy53cml0ZVVJbnQzMkxFKG9mZnNldCwgMCk7XG4gIG5tcy53cml0ZVVJbnQzMkxFKHNpemUsIDQpO1xuICBubXMud3JpdGVVSW50MTZMRShjcmMsIDgpO1xuICByZXR1cm4gbmV3IE5tc0RhdGFncmFtKHtcbiAgICBkZXN0aW5hdGlvbixcbiAgICBpZCxcbiAgICBubXMsXG4gICAgc2VydmljZTogTm1zU2VydmljZVR5cGUuVmVyaWZ5RG9tYWluQ2hlY2tzdW0sXG4gICAgdGltZW91dDogZ2V0TmlidXNUaW1lb3V0KCkgKiAzLFxuICB9KTtcbn1cblxuZXhwb3J0IHR5cGUgVHlwZWRWYWx1ZSA9IFtObXNWYWx1ZVR5cGUsIGFueV07XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVFeGVjdXRlUHJvZ3JhbUludm9jYXRpb24oXG4gIGRlc3RpbmF0aW9uOiBBZGRyZXNzUGFyYW0sXG4gIGlkOiBudW1iZXIsXG4gIG5vdFJlcGx5ID0gZmFsc2UsXG4gIC4uLmFyZ3M6IFR5cGVkVmFsdWVbXSkge1xuICBsZXQgbm1zID0gQnVmZmVyLmFsbG9jKDApO1xuICBpZiAoYXJncy5sZW5ndGggPiAwKSB7XG4gICAgY29uc3Qgc2l6ZSA9IGFyZ3MucmVkdWNlKChsZW4sIFt0eXBlLCB2YWx1ZV0pID0+IGxlbiArIGdldFNpemVPZih0eXBlLCB2YWx1ZSksIDEpO1xuICAgIG5tcyA9IEJ1ZmZlci5hbGxvYyhzaXplKTtcbiAgICBsZXQgcG9zID0gbm1zLndyaXRlVUludDgoYXJncy5sZW5ndGgsIDApO1xuICAgIGFyZ3MuZm9yRWFjaCgoW3R5cGUsIHZhbHVlXSkgPT4ge1xuICAgICAgcG9zID0gd3JpdGVWYWx1ZSh0eXBlLCB2YWx1ZSwgbm1zISwgcG9zKTtcbiAgICB9KTtcbiAgfVxuICByZXR1cm4gbmV3IE5tc0RhdGFncmFtKHtcbiAgICBkZXN0aW5hdGlvbixcbiAgICBpZCxcbiAgICBubXMsXG4gICAgbm90UmVwbHksXG4gICAgc2VydmljZTogTm1zU2VydmljZVR5cGUuRXhlY3V0ZVByb2dyYW1JbnZvY2F0aW9uLFxuICAgIHRpbWVvdXQ6IGdldE5pYnVzVGltZW91dCgpICogMyxcbiAgfSk7XG59XG4iXX0=