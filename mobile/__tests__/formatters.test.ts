import { fmtTime, fmtElapsed, fmtPace, fmtPaceShort } from '../src/lib/formatters'

describe('fmtTime — unpadded leading minute', () => {
  it('renders seconds only as "0:ss"', () => {
    expect(fmtTime(45)).toBe('0:45')
  })
  it('renders minutes as "m:ss"', () => {
    expect(fmtTime(330)).toBe('5:30')
  })
  it('pads seconds', () => {
    expect(fmtTime(65)).toBe('1:05')
  })
  it('renders hours as "h:mm:ss"', () => {
    expect(fmtTime(3930)).toBe('1:05:30')
  })
})

describe('fmtElapsed — always-padded stopwatch', () => {
  it('pads leading minute', () => {
    expect(fmtElapsed(65)).toBe('01:05')
  })
  it('renders hours as "h:mm:ss"', () => {
    expect(fmtElapsed(3930)).toBe('1:05:30')
  })
})

describe('fmtPace — pace with /km unit', () => {
  it('renders valid pace', () => {
    expect(fmtPace(330)).toBe('5:30 /km')
  })
  it('returns --:-- for zero', () => {
    expect(fmtPace(0)).toBe('--:--')
  })
  it('returns --:-- for negative', () => {
    expect(fmtPace(-1)).toBe('--:--')
  })
  it('returns --:-- for Infinity', () => {
    expect(fmtPace(Infinity)).toBe('--:--')
  })
})

describe('fmtPaceShort — pace without unit', () => {
  it('renders valid pace without /km', () => {
    expect(fmtPaceShort(330)).toBe('5:30')
  })
  it('returns --:-- for zero', () => {
    expect(fmtPaceShort(0)).toBe('--:--')
  })
})
