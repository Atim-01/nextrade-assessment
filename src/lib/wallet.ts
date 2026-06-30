import { ethers } from 'ethers'

const DERIVATION_BASE = "m/44'/60'/0'/0"

function getMasterWallet(): ethers.HDNodeWallet {
  const mnemonic = process.env.MNEMONIC
  if (!mnemonic) throw new Error('MNEMONIC not set in environment')
  return ethers.HDNodeWallet.fromMnemonic(
    ethers.Mnemonic.fromPhrase(mnemonic)
  )
}

// Derive a child wallet at a specific index
// This is deterministic — same index always gives same address
export function deriveWallet(index: number): ethers.HDNodeWallet {
  const master = getMasterWallet()
  return master.derivePath(`${DERIVATION_BASE}/${index}`)
}

// Get just the address for a given index (no private key in memory)
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

// Get next derivation index — call this when creating a new user wallet
export function getNextIndex(existingIndexes: number[]): number {
  if (existingIndexes.length === 0) return 0
  return Math.max(...existingIndexes) + 1
}