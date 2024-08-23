const LitJsSdk = require('@lit-protocol/lit-node-client-nodejs');
const { LitContracts } = require('@lit-protocol/contracts-sdk');
const { LitNetwork, AuthMethodScope, AuthMethodType } = require('@lit-protocol/constants');
const { ethers } = require("ethers");
const siwe = require('siwe');

require('dotenv').config();
// env key variables
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const PROVIDER = process.env.PROVIDER_URL;

async function main() {
  // Initialize LitNodeClient
  const litNodeClient = new LitJsSdk.LitNodeClientNodeJs({
        alertWhenUnauthorized: false,
        litNetwork: "datil-dev",
    });
  await litNodeClient.connect();

  let nonce = await litNodeClient.getLatestBlockhash();

  // Initialize the signer
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const address = ethers.utils.getAddress(await wallet.getAddress());

  // initialize ContractClient
  const contractClient = new LitContracts({
    signer: wallet,
    network: LitNetwork.Datil,
  });

  await contractClient.connect();

  // Craft the SIWE message
  const domain = 'localhost';
  const origin = 'https://localhost/login';
  const statement =
    'This is a test statement.  You can put anything you want here.';

  // expiration time in ISO 8601 format.  This is 7 days in the future, calculated in milliseconds
  const expirationTime = new Date(
    Date.now() + 1000 * 60 * 60 * 24 * 7
  ).toISOString();

  const siweMessage = new siwe.SiweMessage({
    domain,
    address: address,
    statement,
    uri: origin,
    version: '1',
    chainId: 1,
    nonce,
    expirationTime,
  });
  const messageToSign = siweMessage.prepareMessage();

  // Sign the message and format the authSig
  const signature = await wallet.signMessage(messageToSign);

  const authSig = {
    sig: signature,
    derivedVia: 'web3.eth.personal.sign',
    signedMessage: messageToSign,
    address: address,
  };

  const authMethod = {
    authMethodType: AuthMethodType.EthWallet,
    accessToken: JSON.stringify(authSig),
  };

  const mintInfo = await contractClient.mintWithAuth({
    authMethod: authMethod,
    scopes: [
          // AuthMethodScope.NoPermissions,
          AuthMethodScope.SignAnything,
          AuthMethodScope.PersonalSign
      ],
  });

  console.log(mintInfo, 'MINT')
}

main();