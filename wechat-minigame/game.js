const { TravelSecretGame } = require("./src/app");
const config = require("./src/config");

wx.cloud?.init({ env: config.cloudEnvId, traceUser: true });

const game = new TravelSecretGame();
game.start();
