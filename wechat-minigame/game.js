const { TravelSecretGame } = require("./src/app");

wx.cloud?.init({ traceUser: true });

const game = new TravelSecretGame();
game.start();
