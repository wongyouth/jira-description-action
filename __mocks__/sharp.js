// Mock for sharp module
const sharp = jest.fn().mockImplementation((input) => {
  return {
    resize: jest.fn().mockReturnThis(),
    png: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('mocked-resized-image-data')),
  };
});

module.exports = sharp;
