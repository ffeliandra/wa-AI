const Queue = require('bull');
const messageQueue = new Queue('wa-messages', {
  redis: {
    host: '127.0.0.1',
    port: 6379,
  },
});

module.exports = messageQueue;
