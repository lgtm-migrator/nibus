import Configstore from 'configstore';
// import getConfig from 'next/config';

export const pkgName = 'stela';

// const { serverRuntimeConfig } = getConfig();

const store = new Configstore(pkgName/* , serverRuntimeConfig.bekar */);
export default store;
