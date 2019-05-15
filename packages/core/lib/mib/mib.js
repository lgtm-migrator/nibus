"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.validJsName = validJsName;
exports.unitConverter = unitConverter;
exports.precisionConverter = precisionConverter;
exports.enumerationConverter = enumerationConverter;
exports.representationConverter = representationConverter;
exports.packed8floatConverter = packed8floatConverter;
exports.getIntSize = getIntSize;
exports.minInclusiveConverter = minInclusiveConverter;
exports.maxInclusiveConverter = maxInclusiveConverter;
exports.convertFrom = exports.convertTo = exports.versionTypeConverter = exports.fixedPointNumber4Converter = exports.percentConverter = exports.booleanConverter = exports.toInt = exports.withValue = void 0;

require("source-map-support/register");

var _printf = _interopRequireDefault(require("printf"));

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
function validJsName(name) {
  return name.replace(/(_\w)/g, (_, s) => s[1].toUpperCase());
}

const withValue = (value, writable = false, configurable = false) => ({
  value,
  writable,
  configurable,
  enumerable: true
});

exports.withValue = withValue;
const hex = /^0X[0-9A-F]+$/i;

const isHex = str => hex.test(str) || parseInt(str, 10).toString(10) !== str.toLowerCase().replace(/^[0 ]+/, '');

const toInt = (value = 0) => {
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === 'true') return 1;
  if (value === 'false') return 0;
  return parseInt(value, isHex(value) ? 16 : 10);
};

exports.toInt = toInt;

function unitConverter(unit) {
  const fromRe = new RegExp(`(\\s*${unit}\\s*)$`, 'i');
  return {
    from: value => typeof value === 'string' ? value.replace(fromRe, '') : value,
    to: value => value != null ? `${value}${unit}` : value
  };
}

function precisionConverter(precision) {
  const format = `%.${precision}f`;
  return {
    from: value => typeof value === 'string' ? parseFloat(value) : value,
    to: value => typeof value === 'number' ? (0, _printf.default)(format, value) : value
  };
}

function enumerationConverter(enumerationValues) {
  const from = {};
  const to = {};
  const keys = Reflect.ownKeys(enumerationValues);
  keys.forEach(key => {
    const value = enumerationValues[key];
    const index = toInt(key);
    from[value.annotation] = index;
    to[String(index)] = value.annotation;
  }); // console.log('from %o, to %o', from, to);

  return {
    from: value => {
      if (Reflect.has(from, String(value))) {
        return from[String(value)];
      }

      const simple = toInt(value);
      return Number.isNaN(simple) ? value : simple;
    },
    to: value => {
      let index = toInt(value);
      if (Number.isNaN(index)) index = String(value);
      return Reflect.has(to, String(index)) ? to[String(index)] : value;
    }
  };
}

const yes = /^\s*(yes|on|true|1|да)\s*$/i;
const no = /^\s*(no|off|false|0|нет)\s*$/i;
const booleanConverter = {
  from: value => {
    if (typeof value === 'string') {
      if (yes.test(value)) {
        return true;
      }

      if (no.test(value)) {
        return false;
      }
    }

    return value;
  },
  to: value => {
    if (typeof value === 'boolean') {
      return value ? 'Да' : 'Нет';
    }

    return value;
  }
};
exports.booleanConverter = booleanConverter;
const percentConverter = {
  from: value => typeof value === 'number' ? Math.max(Math.min(Math.round(value * 255 / 100), 255), 0) : value,
  to: value => typeof value === 'number' ? Math.max(Math.min(Math.round(value * 100 / 255), 100), 0) : value
};
exports.percentConverter = percentConverter;

function representationConverter(format, size) {
  let from;
  let to;
  let fmt; // fromFn = toFn = function (value) { return value; };

  switch (format) {
    case '%b':
    case '%B':
      fmt = `%0${size * 8}s`;

      from = value => typeof value === 'string' ? parseInt(value, 2) : value;

      to = value => typeof value === 'number' ? (0, _printf.default)(fmt, value.toString(2)) : value;

      break;

    case '%x':
    case '%X':
      fmt = `%0${size}s`;

      from = value => typeof value === 'string' ? parseInt(value, 16) : value;

      to = value => typeof value === 'number' ? (0, _printf.default)(fmt, value.toString(16)) : value;

      break;

    default:
      from = value => value;

      to = from;
  }

  return {
    from,
    to
  };
}

function packed8floatConverter(subtype) {
  let delta = 0;

  if (subtype.appinfo && subtype.appinfo.zero) {
    delta = parseFloat(subtype.appinfo.zero) || 0;
  }

  return {
    from: value => {
      const val = typeof value === 'string' ? parseFloat(value) : value;
      return typeof val === 'number' ? Math.floor((val - delta) * 100) & 0xFF : val;
    },
    to: value => typeof value === 'number' ? value / 100 + delta : value
  };
}

const fixedPointNumber4Converter = {
  from: value => {
    const val = typeof value === 'string' ? parseFloat(value) : value;

    if (typeof val !== 'number') {
      return val;
    }

    const dec = Math.round(val * 1000) % 1000;
    const hi = (Math.floor(val) << 4) + Math.floor(dec / 100) & 0xFF;
    const low = dec % 10 + (Math.floor(dec / 10) % 10 << 4) & 0xFF;
    return hi << 8 | low;
  },
  to: value => {
    if (typeof value !== 'number') {
      return value;
    }

    const hi = value >> 8 & 0xFF;
    const low = value & 0xFF;
    const dec = (hi & 0xF) * 100 + (low >> 4) * 10 + (low & 0xF);
    return (hi >> 4) + dec / 1000;
  }
};
exports.fixedPointNumber4Converter = fixedPointNumber4Converter;
const versionTypeConverter = {
  from: () => {
    throw new Error('versionType is readonly property');
  },
  to: value => typeof value === 'number' ? `${value >> 8 & 0xFF}.${value & 0xFF} [0x${(value >>> 16).toString(16)}]` : value
};
exports.versionTypeConverter = versionTypeConverter;

function getIntSize(type) {
  switch (type) {
    case 'xs:NMTOKEN':
    case 'xs:unsignedByte':
    case 'xs:byte':
      return 1;

    case 'xs:short':
    case 'xs:unsignedShort':
      return 2;

    case 'xs:int':
    case 'xs:unsignedInt':
      return 4;

    case 'xs:long':
    case 'xs:unsignedLong':
      return 8;
  }
}

function minInclusiveConverter(min) {
  return {
    from: value => typeof value === 'number' ? Math.max(value, min) : value,
    to: value => value
  };
}

function maxInclusiveConverter(max) {
  return {
    from: value => typeof value === 'number' ? Math.min(value, max) : value,
    to: value => value
  };
}

const convertTo = converters => value => converters.reduceRight((result, converter) => result !== undefined && converter.to(result), value);

exports.convertTo = convertTo;

const convertFrom = converters => value => converters.reduce((present, converter) => converter.from(present), value);

exports.convertFrom = convertFrom;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9taWIvbWliLnRzIl0sIm5hbWVzIjpbInZhbGlkSnNOYW1lIiwibmFtZSIsInJlcGxhY2UiLCJfIiwicyIsInRvVXBwZXJDYXNlIiwid2l0aFZhbHVlIiwidmFsdWUiLCJ3cml0YWJsZSIsImNvbmZpZ3VyYWJsZSIsImVudW1lcmFibGUiLCJoZXgiLCJpc0hleCIsInN0ciIsInRlc3QiLCJwYXJzZUludCIsInRvU3RyaW5nIiwidG9Mb3dlckNhc2UiLCJ0b0ludCIsInVuaXRDb252ZXJ0ZXIiLCJ1bml0IiwiZnJvbVJlIiwiUmVnRXhwIiwiZnJvbSIsInRvIiwicHJlY2lzaW9uQ29udmVydGVyIiwicHJlY2lzaW9uIiwiZm9ybWF0IiwicGFyc2VGbG9hdCIsImVudW1lcmF0aW9uQ29udmVydGVyIiwiZW51bWVyYXRpb25WYWx1ZXMiLCJrZXlzIiwiUmVmbGVjdCIsIm93bktleXMiLCJmb3JFYWNoIiwia2V5IiwiaW5kZXgiLCJhbm5vdGF0aW9uIiwiU3RyaW5nIiwiaGFzIiwic2ltcGxlIiwiTnVtYmVyIiwiaXNOYU4iLCJ5ZXMiLCJubyIsImJvb2xlYW5Db252ZXJ0ZXIiLCJwZXJjZW50Q29udmVydGVyIiwiTWF0aCIsIm1heCIsIm1pbiIsInJvdW5kIiwicmVwcmVzZW50YXRpb25Db252ZXJ0ZXIiLCJzaXplIiwiZm10IiwicGFja2VkOGZsb2F0Q29udmVydGVyIiwic3VidHlwZSIsImRlbHRhIiwiYXBwaW5mbyIsInplcm8iLCJ2YWwiLCJmbG9vciIsImZpeGVkUG9pbnROdW1iZXI0Q29udmVydGVyIiwiZGVjIiwiaGkiLCJsb3ciLCJ2ZXJzaW9uVHlwZUNvbnZlcnRlciIsIkVycm9yIiwiZ2V0SW50U2l6ZSIsInR5cGUiLCJtaW5JbmNsdXNpdmVDb252ZXJ0ZXIiLCJtYXhJbmNsdXNpdmVDb252ZXJ0ZXIiLCJjb252ZXJ0VG8iLCJjb252ZXJ0ZXJzIiwicmVkdWNlUmlnaHQiLCJyZXN1bHQiLCJjb252ZXJ0ZXIiLCJ1bmRlZmluZWQi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QUFTLEdBQUlDLFVBQUQsSUFBK0JqRSxLQUFELElBQ3JEaUUsVUFBVSxDQUFDQyxXQUFYLENBQ0UsQ0FBQ0MsTUFBRCxFQUFTQyxTQUFULEtBQXVCRCxNQUFNLEtBQUtFLFNBQVgsSUFBd0JELFNBQVMsQ0FBQ25ELEVBQVYsQ0FBYWtELE1BQWIsQ0FEakQsRUFFRW5FLEtBRkYsQ0FESzs7OztBQU1BLE1BQU1zRSxXQUFXLEdBQUlMLFVBQUQsSUFBK0JqRSxLQUFELElBQ3ZEaUUsVUFBVSxDQUFDTSxNQUFYLENBQWtCLENBQUNDLE9BQUQsRUFBVUosU0FBVixLQUF3QkEsU0FBUyxDQUFDcEQsSUFBVixDQUFld0QsT0FBZixDQUExQyxFQUFtRXhFLEtBQW5FLENBREsiLCJzb3VyY2VzQ29udGVudCI6WyIvKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCAoYykgMjAxOS4gT09PIE5hdGEtSW5mb1xuICogQGF1dGhvciBBbmRyZWkgU2FyYWtlZXYgPGF2c0BuYXRhLWluZm8ucnU+XG4gKlxuICogVGhpcyBmaWxlIGlzIHBhcnQgb2YgdGhlIFwiQG5hdGFcIiBwcm9qZWN0LlxuICogRm9yIHRoZSBmdWxsIGNvcHlyaWdodCBhbmQgbGljZW5zZSBpbmZvcm1hdGlvbiwgcGxlYXNlIHZpZXdcbiAqIHRoZSBFVUxBIGZpbGUgdGhhdCB3YXMgZGlzdHJpYnV0ZWQgd2l0aCB0aGlzIHNvdXJjZSBjb2RlLlxuICovXG5cbmltcG9ydCBwcmludGYgZnJvbSAncHJpbnRmJztcbmltcG9ydCB7IElNaWJUeXBlIH0gZnJvbSAnLi9kZXZpY2VzJztcblxuZXhwb3J0IGZ1bmN0aW9uIHZhbGlkSnNOYW1lKG5hbWU6IHN0cmluZykge1xuICByZXR1cm4gbmFtZS5yZXBsYWNlKC8oX1xcdykvZywgKF8sIHMpID0+IHNbMV0udG9VcHBlckNhc2UoKSk7XG59XG5cbmV4cG9ydCBjb25zdCB3aXRoVmFsdWUgPVxuICAodmFsdWU6IGFueSwgd3JpdGFibGUgPSBmYWxzZSwgY29uZmlndXJhYmxlID0gZmFsc2UpOiBQcm9wZXJ0eURlc2NyaXB0b3IgPT4gKHtcbiAgICB2YWx1ZSxcbiAgICB3cml0YWJsZSxcbiAgICBjb25maWd1cmFibGUsXG4gICAgZW51bWVyYWJsZTogdHJ1ZSxcbiAgfSk7XG5jb25zdCBoZXggPSAvXjBYWzAtOUEtRl0rJC9pO1xuY29uc3QgaXNIZXggPSAoc3RyOiBzdHJpbmcpID0+IGhleC50ZXN0KHN0cilcbiAgfHwgcGFyc2VJbnQoc3RyLCAxMCkudG9TdHJpbmcoMTApICE9PSBzdHIudG9Mb3dlckNhc2UoKS5yZXBsYWNlKC9eWzAgXSsvLCAnJyk7XG5cbmV4cG9ydCBjb25zdCB0b0ludCA9ICh2YWx1ZTogc3RyaW5nIHwgYm9vbGVhbiB8IG51bWJlciA9IDApOiBudW1iZXIgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJykgcmV0dXJuIHZhbHVlO1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHJldHVybiB2YWx1ZSA/IDEgOiAwO1xuICBpZiAodmFsdWUgPT09ICd0cnVlJykgcmV0dXJuIDE7XG4gIGlmICh2YWx1ZSA9PT0gJ2ZhbHNlJykgcmV0dXJuIDA7XG4gIHJldHVybiBwYXJzZUludCh2YWx1ZSwgaXNIZXgodmFsdWUpID8gMTYgOiAxMCk7XG59O1xuXG50eXBlIFJlc3VsdFR5cGUgPSBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuIHwgdW5kZWZpbmVkO1xudHlwZSBQcmVzZW50VHlwZSA9IHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4gfCB1bmRlZmluZWQ7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnZlcnRlciB7XG4gIGZyb206ICh2YWx1ZTogUHJlc2VudFR5cGUpID0+IFJlc3VsdFR5cGU7XG4gIHRvOiAodmFsdWU6IFJlc3VsdFR5cGUpID0+IFByZXNlbnRUeXBlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdW5pdENvbnZlcnRlcih1bml0OiBzdHJpbmcpOiBJQ29udmVydGVyIHtcbiAgY29uc3QgZnJvbVJlID0gbmV3IFJlZ0V4cChgKFxcXFxzKiR7dW5pdH1cXFxccyopJGAsICdpJyk7XG4gIHJldHVybiB7XG4gICAgZnJvbTogdmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHZhbHVlLnJlcGxhY2UoZnJvbVJlLCAnJykgOiB2YWx1ZSxcbiAgICB0bzogdmFsdWUgPT4gdmFsdWUgIT0gbnVsbCA/IGAke3ZhbHVlfSR7dW5pdH1gIDogdmFsdWUsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwcmVjaXNpb25Db252ZXJ0ZXIocHJlY2lzaW9uOiBzdHJpbmcpOiBJQ29udmVydGVyIHtcbiAgY29uc3QgZm9ybWF0ID0gYCUuJHtwcmVjaXNpb259ZmA7XG4gIHJldHVybiB7XG4gICAgZnJvbTogdmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHBhcnNlRmxvYXQodmFsdWUpIDogdmFsdWUsXG4gICAgdG86IHZhbHVlID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgPyBwcmludGYoZm9ybWF0LCB2YWx1ZSkgOiB2YWx1ZSxcbiAgfTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGVudW1lcmF0aW9uQ29udmVydGVyKGVudW1lcmF0aW9uVmFsdWVzOiBJTWliVHlwZVsnZW51bWVyYXRpb24nXSk6IElDb252ZXJ0ZXIge1xuICBjb25zdCBmcm9tOiBhbnkgPSB7fTtcbiAgY29uc3QgdG86IGFueSA9IHt9O1xuICBjb25zdCBrZXlzID0gUmVmbGVjdC5vd25LZXlzKGVudW1lcmF0aW9uVmFsdWVzISkgYXMgc3RyaW5nW107XG4gIGtleXMuZm9yRWFjaCgoa2V5KSA9PiB7XG4gICAgY29uc3QgdmFsdWUgPSBlbnVtZXJhdGlvblZhbHVlcyFba2V5XTtcbiAgICBjb25zdCBpbmRleCA9IHRvSW50KGtleSk7XG4gICAgZnJvbVt2YWx1ZS5hbm5vdGF0aW9uXSA9IGluZGV4O1xuICAgIHRvW1N0cmluZyhpbmRleCldID0gdmFsdWUuYW5ub3RhdGlvbjtcbiAgfSk7XG4gIC8vIGNvbnNvbGUubG9nKCdmcm9tICVvLCB0byAlbycsIGZyb20sIHRvKTtcbiAgcmV0dXJuIHtcbiAgICBmcm9tOiAodmFsdWUpID0+IHtcbiAgICAgIGlmIChSZWZsZWN0Lmhhcyhmcm9tLCBTdHJpbmcodmFsdWUpKSkge1xuICAgICAgICByZXR1cm4gZnJvbVtTdHJpbmcodmFsdWUpXTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IHNpbXBsZSA9IHRvSW50KHZhbHVlKTtcbiAgICAgIHJldHVybiBOdW1iZXIuaXNOYU4oc2ltcGxlKSA/IHZhbHVlIDogc2ltcGxlO1xuICAgIH0sXG4gICAgdG86ICh2YWx1ZSkgPT4ge1xuICAgICAgbGV0IGluZGV4OiBudW1iZXIgfCBzdHJpbmcgPSB0b0ludCh2YWx1ZSk7XG4gICAgICBpZiAoTnVtYmVyLmlzTmFOKGluZGV4KSkgaW5kZXggPSBTdHJpbmcodmFsdWUpO1xuICAgICAgcmV0dXJuIFJlZmxlY3QuaGFzKHRvLCBTdHJpbmcoaW5kZXgpKSA/IHRvW1N0cmluZyhpbmRleCldIDogdmFsdWU7XG4gICAgfSxcbiAgfTtcbn1cblxuY29uc3QgeWVzID0gL15cXHMqKHllc3xvbnx0cnVlfDF80LTQsClcXHMqJC9pO1xuY29uc3Qgbm8gPSAvXlxccyoobm98b2ZmfGZhbHNlfDB80L3QtdGCKVxccyokL2k7XG5leHBvcnQgY29uc3QgYm9vbGVhbkNvbnZlcnRlcjogSUNvbnZlcnRlciA9IHtcbiAgZnJvbTogKHZhbHVlKSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIGlmICh5ZXMudGVzdCh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgICBpZiAobm8udGVzdCh2YWx1ZSkpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG4gIH0sXG4gIHRvOiAodmFsdWUpID0+IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICAgIHJldHVybiB2YWx1ZSA/ICfQlNCwJyA6ICfQndC10YInO1xuICAgIH1cbiAgICByZXR1cm4gdmFsdWU7XG4gIH0sXG59O1xuXG5leHBvcnQgY29uc3QgcGVyY2VudENvbnZlcnRlcjogSUNvbnZlcnRlciA9IHtcbiAgZnJvbTogdmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyA/IE1hdGgubWF4KE1hdGgubWluKFxuICAgIE1hdGgucm91bmQodmFsdWUgKiAyNTUgLyAxMDApLFxuICAgIDI1NSxcbiAgKSwgMCkgOiB2YWx1ZSxcbiAgdG86IHZhbHVlID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgPyBNYXRoLm1heChcbiAgICBNYXRoLm1pbihNYXRoLnJvdW5kKHZhbHVlICogMTAwIC8gMjU1KSwgMTAwKSxcbiAgICAwLFxuICApIDogdmFsdWUsXG59O1xuXG5leHBvcnQgZnVuY3Rpb24gcmVwcmVzZW50YXRpb25Db252ZXJ0ZXIoZm9ybWF0OiBzdHJpbmcsIHNpemU6IG51bWJlcik6IElDb252ZXJ0ZXIge1xuICBsZXQgZnJvbTogSUNvbnZlcnRlclsnZnJvbSddO1xuICBsZXQgdG86IElDb252ZXJ0ZXJbJ3RvJ107XG4gIGxldCBmbXQ6IHN0cmluZztcbiAgLy8gZnJvbUZuID0gdG9GbiA9IGZ1bmN0aW9uICh2YWx1ZSkgeyByZXR1cm4gdmFsdWU7IH07XG5cbiAgc3dpdGNoIChmb3JtYXQpIHtcbiAgICBjYXNlICclYic6XG4gICAgY2FzZSAnJUInOlxuICAgICAgZm10ID0gYCUwJHtzaXplICogOH1zYDtcbiAgICAgIGZyb20gPSB2YWx1ZSA9PiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gcGFyc2VJbnQodmFsdWUsIDIpIDogdmFsdWU7XG4gICAgICB0byA9IHZhbHVlID0+IHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgPyBwcmludGYoZm10LCB2YWx1ZS50b1N0cmluZygyKSkgOiB2YWx1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgJyV4JzpcbiAgICBjYXNlICclWCc6XG4gICAgICBmbXQgPSBgJTAke3NpemV9c2A7XG4gICAgICBmcm9tID0gdmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHBhcnNlSW50KHZhbHVlLCAxNikgOiB2YWx1ZTtcbiAgICAgIHRvID0gdmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyA/IHByaW50ZihmbXQsIHZhbHVlLnRvU3RyaW5nKDE2KSkgOiB2YWx1ZTtcbiAgICAgIGJyZWFrO1xuICAgIGRlZmF1bHQ6XG4gICAgICBmcm9tID0gdmFsdWUgPT4gdmFsdWU7XG4gICAgICB0byA9IGZyb207XG4gIH1cblxuICByZXR1cm4ge1xuICAgIGZyb20sXG4gICAgdG8sXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBwYWNrZWQ4ZmxvYXRDb252ZXJ0ZXIoc3VidHlwZTogSU1pYlR5cGUpOiBJQ29udmVydGVyIHtcbiAgbGV0IGRlbHRhID0gMDtcbiAgaWYgKHN1YnR5cGUuYXBwaW5mbyAmJiBzdWJ0eXBlLmFwcGluZm8uemVybykge1xuICAgIGRlbHRhID0gcGFyc2VGbG9hdChzdWJ0eXBlLmFwcGluZm8uemVybykgfHwgMDtcbiAgfVxuICByZXR1cm4ge1xuICAgIGZyb206ICh2YWx1ZSkgPT4ge1xuICAgICAgY29uc3QgdmFsID0gdHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyA/IHBhcnNlRmxvYXQodmFsdWUpIDogdmFsdWU7XG4gICAgICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ251bWJlcicgPyBNYXRoLmZsb29yKCh2YWwgLSBkZWx0YSkgKiAxMDApICYgMHhGRiA6IHZhbDtcbiAgICB9LFxuICAgIHRvOiB2YWx1ZSA9PiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInID8gdmFsdWUgLyAxMDAgKyBkZWx0YSA6IHZhbHVlLFxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgZml4ZWRQb2ludE51bWJlcjRDb252ZXJ0ZXI6IElDb252ZXJ0ZXIgPSB7XG4gIGZyb206ICh2YWx1ZSkgPT4ge1xuICAgIGNvbnN0IHZhbCA9IHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgPyBwYXJzZUZsb2F0KHZhbHVlKSA6IHZhbHVlO1xuICAgIGlmICh0eXBlb2YgdmFsICE9PSAnbnVtYmVyJykge1xuICAgICAgcmV0dXJuIHZhbDtcbiAgICB9XG4gICAgY29uc3QgZGVjID0gTWF0aC5yb3VuZCh2YWwgKiAxMDAwKSAlIDEwMDA7XG4gICAgY29uc3QgaGkgPSAoKE1hdGguZmxvb3IodmFsKSA8PCA0KSArIE1hdGguZmxvb3IoZGVjIC8gMTAwKSkgJiAweEZGO1xuICAgIGNvbnN0IGxvdyA9IChkZWMgJSAxMCArICgoTWF0aC5mbG9vcihkZWMgLyAxMCkgJSAxMCkgPDwgNCkpICYgMHhGRjtcbiAgICByZXR1cm4gKGhpIDw8IDgpIHwgbG93O1xuICB9LFxuICB0bzogKHZhbHVlKSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gJ251bWJlcicpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgY29uc3QgaGkgPSAodmFsdWUgPj4gOCkgJiAweEZGO1xuICAgIGNvbnN0IGxvdyA9IHZhbHVlICYgMHhGRjtcbiAgICBjb25zdCBkZWMgPSAoaGkgJiAweEYpICogMTAwICsgKGxvdyA+PiA0KSAqIDEwICsgKGxvdyAmIDB4Rik7XG4gICAgcmV0dXJuIChoaSA+PiA0KSArIGRlYyAvIDEwMDA7XG4gIH0sXG59O1xuXG5leHBvcnQgY29uc3QgdmVyc2lvblR5cGVDb252ZXJ0ZXI6IElDb252ZXJ0ZXIgPSB7XG4gIGZyb206ICgpID0+IHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3ZlcnNpb25UeXBlIGlzIHJlYWRvbmx5IHByb3BlcnR5Jyk7XG4gIH0sXG4gIHRvOiB2YWx1ZSA9PiB0eXBlb2YgdmFsdWUgPT09ICdudW1iZXInXG4gICAgPyBgJHsodmFsdWUgPj4gOCkgJiAweEZGfS4ke3ZhbHVlICYgMHhGRn0gWzB4JHsodmFsdWUgPj4+IDE2KS50b1N0cmluZygxNil9XWBcbiAgICA6IHZhbHVlLFxufTtcblxuZXhwb3J0IGZ1bmN0aW9uIGdldEludFNpemUodHlwZTogc3RyaW5nKSB7XG4gIHN3aXRjaCAodHlwZSkge1xuICAgIGNhc2UgJ3hzOk5NVE9LRU4nOlxuICAgIGNhc2UgJ3hzOnVuc2lnbmVkQnl0ZSc6XG4gICAgY2FzZSAneHM6Ynl0ZSc6XG4gICAgICByZXR1cm4gMTtcbiAgICBjYXNlICd4czpzaG9ydCc6XG4gICAgY2FzZSAneHM6dW5zaWduZWRTaG9ydCc6XG4gICAgICByZXR1cm4gMjtcbiAgICBjYXNlICd4czppbnQnOlxuICAgIGNhc2UgJ3hzOnVuc2lnbmVkSW50JzpcbiAgICAgIHJldHVybiA0O1xuICAgIGNhc2UgJ3hzOmxvbmcnOlxuICAgIGNhc2UgJ3hzOnVuc2lnbmVkTG9uZyc6XG4gICAgICByZXR1cm4gODtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gbWluSW5jbHVzaXZlQ29udmVydGVyKG1pbjogbnVtYmVyKTogSUNvbnZlcnRlciB7XG4gIHJldHVybiB7XG4gICAgZnJvbTogdmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyA/IE1hdGgubWF4KHZhbHVlLCBtaW4pIDogdmFsdWUsXG4gICAgdG86IHZhbHVlID0+IHZhbHVlLFxuICB9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWF4SW5jbHVzaXZlQ29udmVydGVyKG1heDogbnVtYmVyKTogSUNvbnZlcnRlciB7XG4gIHJldHVybiB7XG4gICAgZnJvbTogdmFsdWUgPT4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyA/IE1hdGgubWluKHZhbHVlLCBtYXgpIDogdmFsdWUsXG4gICAgdG86IHZhbHVlID0+IHZhbHVlLFxuICB9O1xufVxuXG5leHBvcnQgY29uc3QgY29udmVydFRvID0gKGNvbnZlcnRlcnM6IElDb252ZXJ0ZXJbXSkgPT4gKHZhbHVlOiBSZXN1bHRUeXBlKSA9PlxuICBjb252ZXJ0ZXJzLnJlZHVjZVJpZ2h0KFxuICAgIChyZXN1bHQsIGNvbnZlcnRlcikgPT4gcmVzdWx0ICE9PSB1bmRlZmluZWQgJiYgY29udmVydGVyLnRvKHJlc3VsdCksXG4gICAgdmFsdWUsXG4gICk7XG5cbmV4cG9ydCBjb25zdCBjb252ZXJ0RnJvbSA9IChjb252ZXJ0ZXJzOiBJQ29udmVydGVyW10pID0+ICh2YWx1ZTogUHJlc2VudFR5cGUpID0+XG4gIGNvbnZlcnRlcnMucmVkdWNlKChwcmVzZW50LCBjb252ZXJ0ZXIpID0+IGNvbnZlcnRlci5mcm9tKHByZXNlbnQpLCB2YWx1ZSk7XG4iXX0=