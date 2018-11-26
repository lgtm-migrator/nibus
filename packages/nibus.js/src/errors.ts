export class MibError extends Error {
}

const getErrMsg = (errcode: number, prototype: object) => {
  const errEnum = Reflect.getMetadata('errorType', prototype);
  return errEnum && errEnum[errcode] && errEnum[errcode].annotation || `NiBUS error ${errcode}`;
};

export class NibusError extends Error {
  constructor(public errcode: number, prototype: object) {
    super(getErrMsg(errcode, prototype));
  }
}

export class TimeoutError extends Error {
  constructor(msg = 'Timeout error') {
    super(msg);
  }
}
