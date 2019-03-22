/* tslint:disable:variable-name */
import * as t from 'io-ts';
// import { NibusBaudRate, NibusBaudRateV } from '../nibus';

export type HexOrNumber = string | number;
export const CategoryV = t.union([
  t.keyof({
    siolynx: null,
    minihost: null,
    fancontrol: null,
    c22: null,
    relay: null,
    undefined: null,
  }),
  t.undefined,
]);
export type Category = t.TypeOf<typeof CategoryV>;
export const KnownPortV = t.intersection([
  t.type({
    comName: t.string,
    productId: t.number,
    vendorId: t.number,
  }),
  t.partial({
    manufacturer: t.string,
    serialNumber: t.string,
    pnpId: t.string,
    locationId: t.string,
    deviceAddress: t.number,
    device: t.string,
    category: CategoryV,
  }),
]);

export interface IKnownPort extends t.TypeOf<typeof KnownPortV> {}

export const FindKindV = t.keyof({
  sarp: null,
  version: null,
}, 'FindKind');
export type FindKind = t.TypeOf<typeof FindKindV>;

export const NibusBaudRateV = t.union(
  [t.literal(115200), t.literal(57600), t.literal(28800)],
  'NibusBaudRate',
);

export const NibusParityV = t.keyof(
  {
    none: null,
    even: null,
    mark: null,
  },
  'NibusParity',
);

export type NibusBaudRate = t.TypeOf<typeof NibusBaudRateV>;
export type NibusParity = t.TypeOf<typeof NibusParityV>;

export const MibDescriptionV = t.partial({
  type: t.number,
  mib: t.string,
  link: t.boolean,
  baudRate: NibusBaudRateV,
  parity: NibusParityV,
  category: t.string,
  find: FindKindV,
  disableBatchReading: t.boolean,
});

export interface IMibDescription extends t.TypeOf<typeof MibDescriptionV> {
  // baudRate?: NibusBaudRate;
  // parity?: NibusParity;
  // find?: FindKind;
}