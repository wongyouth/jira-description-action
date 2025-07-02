// Mock for jimp module
const Jimp = {
  read: jest.fn().mockResolvedValue({
    resize: jest.fn().mockReturnThis(),
    getBuffer: jest.fn().mockResolvedValue(Buffer.from('mocked-resized-image-data')),
  }),
};

module.exports = { Jimp };
