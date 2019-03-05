"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MibDescriptionV = exports.NibusBaudRateV = exports.FindKindV = exports.KnownPortV = exports.CategoryV = void 0;

var t = _interopRequireWildcard(require("io-ts"));

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) { var desc = Object.defineProperty && Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : {}; if (desc.get || desc.set) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } } newObj.default = obj; return newObj; } }

/* tslint:disable:variable-name */
const CategoryV = t.union([t.literal('siolynx'), t.literal('minihost'), t.literal('fancontrol'), t.literal('c22'), t.literal('relay'), t.undefined]);
exports.CategoryV = CategoryV;
const KnownPortV = t.intersection([t.type({
  comName: t.string,
  productId: t.number,
  vendorId: t.number
}), t.partial({
  manufacturer: t.string,
  serialNumber: t.string,
  pnpId: t.string,
  locationId: t.string,
  device: t.string,
  category: CategoryV
})]);
exports.KnownPortV = KnownPortV;
const FindKindV = t.keyof({
  sarp: null,
  version: null
}, 'FindKind');
exports.FindKindV = FindKindV;
const NibusBaudRateV = t.union([t.literal(115200), t.literal(57600), t.literal(28800)], 'NibusBaudRate');
exports.NibusBaudRateV = NibusBaudRateV;
const MibDescriptionV = t.partial({
  mib: t.string,
  link: t.boolean,
  baudRate: NibusBaudRateV,
  category: t.string,
  find: FindKindV,
  disableBatchReading: t.boolean
});
exports.MibDescriptionV = MibDescriptionV;