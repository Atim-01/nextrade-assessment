import { ethers } from 'ethers'

function getMnemonic(): string {
  const mnemonic = process.env.MNEMONIC
  if (!mnemonic) throw new Error('MNEMONIC not set in environment')
  return mnemonic
}

// Derive a child wallet at a specific index directly from mnemonic
export function deriveWallet(index: number): ethers.HDNodeWallet {
  const mnemonic = ethers.Mnemonic.fromPhrase(getMnemonic())
  return ethers.HDNodeWallet.fromMnemonic(mnemonic, `m/44'/60'/0'/0/${index}`)
}

// Get just the address for a given index (no private key held in memory)
export function deriveAddress(index: number): string {
  return deriveWallet(index).address
}

// Get a connected wallet ready to sign and send transactions
export function getSignerWallet(
  index: number,
  provider: ethers.Provider
): ethers.HDNodeWallet {
  return deriveWallet(index).connect(provider)
}

// Get a provider connected to our chain
export function getProvider(): ethers.JsonRpcProvider {
  const rpc = process.env.CHAIN_RPC
  if (!rpc) throw new Error('CHAIN_RPC not set in environment')
  return new ethers.JsonRpcProvider(rpc)
}

// Get next derivation index
export function getNextIndex(existingIndexes: number[]): number {
  if (existingIndexes.length === 0) return 1
  return Math.max(...existingIndexes) + 1
}