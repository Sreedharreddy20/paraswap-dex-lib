/* eslint-disable no-console */
import dotenv from 'dotenv';
dotenv.config();

import { DummyDexHelper } from '../src/dex-helper';
import { Network, SwapSide } from '../src/constants';
import { UniswapV2 } from '../src/dex/uniswap-v2/uniswap-v2';
import { Tokens } from '../tests/constants-e2e';

function getArg(name: string, def?: string) {
  const p = `--${name}=`;
  const a = process.argv.find(s => s.startsWith(p));
  return (a ? a.slice(p.length) : def) ?? '';
}

const pair = (getArg('pair', 'WBTC/WETH') as string).toUpperCase();
const side = (getArg('side', 'SELL') as string).toUpperCase() as 'SELL' | 'BUY';
const amountHuman = Number(getArg('amount', '0.01'));

function fmtUnits(x: bigint, dec: number) {
  const s = x.toString().padStart(dec + 1, '0');
  const i = s.slice(0, -dec) || '0';
  const f = s.slice(-dec).replace(/0+$/, '') || '0';
  return `${i}.${f}`;
}

function pricePerOne(
  amountIn: bigint,
  amountOut: bigint,
  srcDec: number,
  dstDec: number,
  buySide: boolean,
) {
  const SCALE = 10n ** 18n;
  if (!buySide) {
    const num = amountOut * 10n ** BigInt(srcDec) * SCALE;
    const den = amountIn * 10n ** BigInt(dstDec);
    return fmtUnits(num / (den === 0n ? 1n : den), 18);
  } else {
    const num = amountIn * 10n ** BigInt(dstDec) * SCALE;
    const den = amountOut * 10n ** BigInt(srcDec);
    return fmtUnits(num / (den === 0n ? 1n : den), 18);
  }
}

(async () => {
  const network = Network.MAINNET;
  const dexHelper = new DummyDexHelper(network);
  const uniV2 = new UniswapV2(network, 'UniswapV2', dexHelper);

  const [symA, symB] = pair.split('/');
  const tokenA = (Tokens as any)[network]?.[symA];
  const tokenB = (Tokens as any)[network]?.[symB];
  if (!tokenA || !tokenB) throw new Error(`Unknown pair ${pair}`);

  const srcToken = side === 'SELL' ? tokenA : tokenB;
  const dstToken = side === 'SELL' ? tokenB : tokenA;

  const relevantDec = side === 'SELL' ? srcToken.decimals : dstToken.decimals;
  const amount = BigInt(Math.round(amountHuman * 10 ** relevantDec));
  const tiers = [0n, amount, amount * 2n];

  const block = await dexHelper.web3Provider.eth.getBlockNumber();
  const swapSide = side === 'SELL' ? SwapSide.SELL : SwapSide.BUY;

  const pools = await (uniV2 as any).getPoolIdentifiers(
    srcToken,
    dstToken,
    swapSide,
    block,
  );
  if (!pools?.length)
    throw new Error('No Uniswap V2 pools found for this pair/side.');

  const quotes = await (uniV2 as any).getPricesVolume(
    srcToken,
    dstToken,
    tiers,
    swapSide,
    block,
    pools,
  );
  const line: any = quotes?.[0];
  if (!line) throw new Error('No Uniswap V2 quote returned.');

  const out = (line.prices?.[1] ?? 0n) as bigint;
  const exPrice = pricePerOne(
    side === 'SELL' ? tiers[1] : out,
    side === 'SELL' ? out : tiers[1],
    srcToken.decimals,
    dstToken.decimals,
    side === 'BUY',
  );

  console.log('='.repeat(60));
  console.log('Simple Uniswap V2 Quote (ParaSwap dex-lib)');
  console.log('Pair:', pair, 'Side:', side, 'Amount:', amountHuman);
  console.log('Block:', block);
  console.log('-'.repeat(60));
  console.log(
    `UniswapV2: ${side === 'SELL' ? 'destOut' : 'srcIn'}=${fmtUnits(
      out,
      side === 'SELL' ? dstToken.decimals : srcToken.decimals,
    )}`,
  );
  if (side === 'SELL') {
    console.log(
      `Exchange price: ${exPrice} ${dstToken.symbol} per 1 ${srcToken.symbol}`,
    );
  } else {
    console.log(
      `Exchange price: ${exPrice} ${srcToken.symbol} per 1 ${dstToken.symbol}`,
    );
  }
  console.log('-'.repeat(60));

  try {
    // @ts-ignore
    dexHelper?.web3Provider?.currentProvider?.removeAllListeners?.();
    // @ts-ignore
    await dexHelper?.web3Provider?.currentProvider?.disconnect?.();
  } catch {}
  process.exit(0);
})().catch(e => {
  console.error(e);
  process.exit(1);
});
