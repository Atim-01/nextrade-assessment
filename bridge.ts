import { ethers } from 'ethers'
import dotenv from 'dotenv'
dotenv.config()

// Base Sepolia bridge contract on Ethereum Sepolia
const BASE_BRIDGE_ADDRESS = '0xfd0Bf71F60660E2f608ed56e1659C450eB113120'

// Bridge ABI — just the depositTransaction function we need
const BRIDGE_ABI = [
  'function depositETH(uint32 _minGasLimit, bytes calldata _extraData) payable'
]

async function bridge() {
  const provider = new ethers.JsonRpcProvider(
    'https://eth-sepolia.g.alchemy.com/v2/qfnll1dk3_CUPQyV-zimZ'
  )

  // Derive wallet at index 1 — that's your user deposit address
  const mnemonic = process.env.MNEMONIC!
  const wallet = ethers.HDNodeWallet.fromMnemonic(
    ethers.Mnemonic.fromPhrase(mnemonic),
    `m/44'/60'/0'/0/1`
  ).connect(provider)

  console.log('Bridging from:', wallet.address)
  console.log('To Base Sepolia...')

  const balance = await provider.getBalance(wallet.address)
  console.log('Current Sepolia balance:', ethers.formatEther(balance), 'ETH')

  const bridge = new ethers.Contract(BASE_BRIDGE_ADDRESS, BRIDGE_ABI, wallet)

  // Bridge 0.02 ETH — keep some for gas
  const amountToBridge = ethers.parseEther('0.02')

  const tx = await bridge.depositETH(
    200000, // min gas limit on Base side
    '0x',   // no extra data
    { value: amountToBridge }
  )

  console.log('Bridge tx submitted:', tx.hash)
  console.log('Waiting for confirmation on Sepolia...')

  await tx.wait(2)

  console.log('✅ Bridge transaction confirmed!')
  console.log('ETH will arrive on Base Sepolia in ~1-3 minutes')
  console.log('Destination address:', wallet.address)
}

bridge().catch(console.error)