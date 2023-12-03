import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { config as dotEnvConfig } from "dotenv";
dotEnvConfig({ path: __dirname + "/.env" });

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  mocha: {
    timeout: 100000000,
  },
  networks: {
    fork: {
      url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_API_KEY}`,
    },
    hardhat: {
      forking: {
        url: `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_MAINNET_API_KEY}`,
        enabled: true,
      },
    },
  },
};

export default config;
