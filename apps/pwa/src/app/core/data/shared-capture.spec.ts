// SPDX-License-Identifier: EUPL-1.2
import { sharedCapture } from './shared-capture';

describe('sharedCapture', () => {
  it.each([
    {
      name: 'puts the title first and the url after it',
      params: { title: 'A page', text: 'https://x.y' },
      expected: { title: 'A page', captureText: 'A page\nhttps://x.y' },
    },
    {
      name: 'trims lines, drops empty ones and titles with the first line',
      params: { text: '\n line one \nline two' },
      expected: { title: 'line one', captureText: 'line one\nline two' },
    },
    {
      name: 'leaves out a url that the text already contains',
      params: { text: 'see https://x.y', url: 'https://x.y' },
      expected: { title: 'see https://x.y', captureText: 'see https://x.y' },
    },
    {
      name: 'appends a url the text does not contain',
      params: { title: 'T', url: 'https://x.y' },
      expected: { title: 'T', captureText: 'T\nhttps://x.y' },
    },
    {
      name: 'trims a lone url',
      params: { url: ' https://x.y ' },
      expected: { title: 'https://x.y', captureText: 'https://x.y' },
    },
    {
      name: 'splits on CRLF',
      params: { title: 'a\r\nb' },
      expected: { title: 'a', captureText: 'a\nb' },
    },
  ])('$name', ({ params, expected }) => {
    expect(sharedCapture(params)).toEqual(expected);
  });

  it.each([
    { name: 'nothing', params: {} },
    { name: 'empty strings', params: { title: '', text: '', url: '' } },
    { name: 'whitespace only', params: { title: '  ', text: ' \n\t', url: ' ' } },
  ])('returns null for $name', ({ params }) => {
    expect(sharedCapture(params)).toBeNull();
  });
});
