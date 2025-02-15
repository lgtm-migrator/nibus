/*
 * @license
 * Copyright (c) 2022. Nata-Info
 * @author Andrei Sarakeev <avs@nata-info.ru>
 *
 * This file is part of the "@nibus" project.
 * For the full copyright and license information, please view
 * the EULA file that was distributed with this source code.
 */

export default {
  mibCategories: {
    siolynx: {
      mib: 'siolynx',
      link: true,
      find: 'version',
    },
    minihost: {
      type: 43974,
      find: 'sarp',
    },
    fancontrol: {
      mib: 'fan_control',
      find: 'version',
      link: true,
    },
    c22: {
      link: true,
      find: 'version',
      win32: { parity: 'even' },
    },
    sensor: {
      mib: 'ti_lux_2_3',
      find: 'sarp',
      disableBatchReading: true,
    },
    ftdi: { select: ['siolynx', 'minihost'] },
  },
  knownDevices: [
    {
      vid: '2047',
      pid: '0a3d',
      category: 'minihost',
    },
    {
      device: 'Siolynx2',
      vid: '0403',
      pid: '6001',
      category: 'siolynx',
    },
    {
      device: 'FT232R USB UART',
      vid: '0403',
      pid: '6001',
      manufacturer: 'FTDI',
      category: 'siolynx',
    },
    {
      device: 'FanControl',
      vid: '0403',
      pid: '6001',
      manufacturer: 'NATA',
      category: 'fancontrol',
    },
    {
      device: 'C22 USB to RS422 Converter',
      vid: '0403',
      pid: '6001',
      manufacturer: 'NATA',
      category: 'c22',
    },
    {
      device: 'C22 USB to RS422 Converter',
      vid: '0403',
      pid: '6015',
      manufacturer: 'Nata-Info',
      category: 'c22',
    },
    {
      device: 'AlphaHostControl',
      vid: '0403',
      pid: '6001',
      manufacturer: 'Nata-Info',
      category: 'minihost',
    },
    {
      device: 'AlphaHostControl',
      vid: '0403',
      pid: '6015',
      manufacturer: 'Nata-Info',
      category: 'minihost',
    },
    {
      device: 'MiniHost_alfa',
      vid: '0403',
      pid: '6015',
      manufacturer: 'Nata-Info',
      category: 'minihost',
    },
    {
      device: 'HostControlMini',
      vid: '0403',
      pid: '6001',
      manufacturer: 'SlimDVI',
      category: 'minihost',
    },
    {
      device: 'MiniHost_alfa',
      vid: '0403',
      pid: '6001',
      manufacturer: 'Nata-Info',
      category: 'minihost',
    },
    {
      device: 'FT230X Basic UART',
      vid: '0403',
      pid: '6015',
      manufacturer: 'FTDI',
      category: 'minihost',
    },
    {
      device: 'Ke-USB24R',
      vid: 1240,
      pid: 10,
      serialNumber: 'K_Ke-USB24R',
      category: 'relay',
    },
  ],
};
