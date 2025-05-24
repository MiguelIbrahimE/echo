// fe/jest.setup.ts

// This line adds the jest-dom custom matchers like .toBeInTheDocument()
import '@testing-library/jest-dom';

// You can also add other global setup mocks or configurations here if needed.
// For example, if 'atob' or 'btoa' cause issues in your Jest environment (though modern JSDOM usually has them):
// if (typeof global.atob === 'undefined') {
//   global.atob = (str: string) => Buffer.from(str, 'base64').toString('binary');
// }
// if (typeof global.btoa === 'undefined') {
//   global.btoa = (str: string) => Buffer.from(str, 'binary').toString('base64');
// }

// Any other global setup can go here.