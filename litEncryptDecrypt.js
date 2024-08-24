const LitJsSdk = require('@lit-protocol/lit-node-client-nodejs');
const { LitContracts } = require('@lit-protocol/contracts-sdk');
const { LitNetwork } = require('@lit-protocol/constants');
const { ethers } = require("ethers");
const {
  LitAccessControlConditionResource,
  LitAbility,
  createSiweMessageWithRecaps,
  generateAuthSig,
} = require("@lit-protocol/auth-helpers");

require('dotenv').config();
// env key variables
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER = process.env.PROVIDER_URL;

const delegatedWalletB = new ethers.Wallet(
  '0xe1090085b352120867ea7b154ceeee30654903a6c37afa1d5c5bcabc63c96676',
  new ethers.providers.JsonRpcProvider(PROVIDER)
);

const accessControlConditions = [
  {
    contractAddress: "",
    standardContractType: "",
    chain: "ethereum",
    method: "eth_getBalance",
    parameters: [":userAddress", "latest"],
    returnValueTest: {
      comparator: ">=",
      value: "1000000000000", // 0.000001 ETH
    },
  },
];

// Initialize the signer
const provider = new ethers.providers.JsonRpcProvider(PROVIDER);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);


// initialize ContractClient
const contractClient = new LitContracts({
  signer: wallet,
  network: LitNetwork.Datil,
});

class Lit {
  litNodeClient;
  chain;

  constructor(chain) {
    this.chain = chain;
  }

  async connect() {
    this.litNodeClient = new LitJsSdk.LitNodeClientNodeJs({
      alertWhenUnauthorized: false,
      litNetwork: "datil-dev",
      debug: true,
    })

    await this.litNodeClient.connect();
  }

  async encrypt(message) {
    // Encrypt the message
    const { ciphertext, dataToEncryptHash } = await LitJsSdk.encryptString(
      {
        accessControlConditions,
        dataToEncrypt: message,
      },
      this.litNodeClient,
    );

    // Return the ciphertext and dataToEncryptHash
    return {
      ciphertext,
      dataToEncryptHash,
    };
  }

  async getSessionSignatures(){
    // Connect to the wallet
    const ethWallet = new ethers.Wallet(PRIVATE_KEY);

    // Get the latest blockhash
    const latestBlockhash = await this.litNodeClient.getLatestBlockhash();

    await contractClient.connect();

    // this identifier will be used in delegation requests.
    const { capacityTokenIdStr } = await contractClient.mintCapacityCreditsNFT({
      requestsPerKilosecond: 80,
      // requestsPerDay: 14400,
      // requestsPerSecond: 10,
      daysUntilUTCMidnightExpiration: 2,
    });

    const { capacityDelegationAuthSig } =
    await litNodeClient.createCapacityDelegationAuthSig({
      uses: '1',
      dAppOwnerWallet: wallet,
      capacityTokenId: capacityTokenIdStr,
    });

    // Define the authNeededCallback function
    const authNeededCallback = async(params) => {
      if (!params.uri) {
        throw new Error("uri is required");
      }
      if (!params.expiration) {
        throw new Error("expiration is required");
      }

      if (!params.resourceAbilityRequests) {
        throw new Error("resourceAbilityRequests is required");
      }

      // Create the SIWE message
      const toSign = await createSiweMessageWithRecaps({
        uri: params.uri,
        expiration: params.expiration,
        resources: params.resourceAbilityRequests,
        walletAddress: ethWallet.address,
        nonce: latestBlockhash,
        litNodeClient: this.litNodeClient,
      });

      // Generate the authSig
      const authSig = await generateAuthSig({
        signer: ethWallet,
        toSign,
      });

      return authSig;
    }

    // Define the Lit resource
    const litResource = new LitAccessControlConditionResource('*');

    // Get the session signatures
    const sessionSigs = await this.litNodeClient.getSessionSigs({
        chain: this.chain,
        resourceAbilityRequests: [
            {
                resource: litResource,
                ability: LitAbility.AccessControlConditionDecryption,
            },
        ],
        authNeededCallback,
        capacityDelegationAuthSig,
    });
    return sessionSigs;
  }

  async decrypt(ciphertext, dataToEncryptHash) {
    // Get the session signatures
    const sessionSigs = await this.getSessionSignatures();

    // Decrypt the message
    const decryptedString = await LitJsSdk.decryptToString(
      {
        accessControlConditions,
        chain: this.chain,
        ciphertext,
        dataToEncryptHash,
        sessionSigs,
      },
      this.litNodeClient,
    );

    // Return the decrypted string
    return { decryptedString };
  }
}
const chain = 'ethereum';
let myLit = new Lit(chain);

async function encryptMessage() {
  await myLit.connect();
  const encryptedMsg = await myLit.encrypt('Hello World!');

  console.log(encryptedMsg);
}

async function decryptMessage() {
  await myLit.connect();

  const decryptedMsg = await myLit.decrypt('oNl2lzNtD2mdGyANVLlXJemx/l3/Cn9n2lVhxci0TdQTFhmryGzbO8vTCxVm7hp4mWH84beOheHULUN7hlaOvvU2XkIxKKiBHmWhQNGUmgUgBgws10M+S09aQIE5RskpAyVC9zUqqLL+KW8o8Dyj9eYC', '7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069')

  console.log(decryptedMsg);
}

decryptMessage();