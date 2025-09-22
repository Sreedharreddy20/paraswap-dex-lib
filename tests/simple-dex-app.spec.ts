import dotenv from 'dotenv';
dotenv.config();

import { DummyDexHelper } from '../src/dex-helper';
import { Network, SwapSide } from '../src/constants';
import { UniswapV2 } from '../src/dex/uniswap-v2/uniswap-v2';
import { UniswapV3 } from '../src/dex/uniswap-v3/uniswap-v3';
import { Tokens } from './constants-e2e';

describe('Simple DEX app (unit)', () => {
  it('quotes V2+V3 and builds calldata for best route', async () => {
    const network = Network.MAINNET;
    const dexHelper = new DummyDexHelper(network);
    const uniV2 = new UniswapV2(network, 'UniswapV2', dexHelper);
    const uniV3 = new UniswapV3(network, 'UniswapV3', dexHelper);
    const wbtc = Tokens[network].WBTC;
    const weth = Tokens[network].WETH;

    const amounts = [0n, 1_000_000n, 2_000_000n];
    const block = await dexHelper.web3Provider.eth.getBlockNumber();

    const [pV2, pV3] = await Promise.all([
      uniV2.getPoolIdentifiers(wbtc, weth, SwapSide.SELL, block),
      uniV3.getPoolIdentifiers(wbtc, weth, SwapSide.SELL, block),
    ]);
    expect(pV2.length + pV3.length).toBeGreaterThan(0);

    const [qV2, qV3] = await Promise.all([
      uniV2.getPricesVolume(wbtc, weth, amounts, SwapSide.SELL, block, pV2),
      uniV3.getPricesVolume(wbtc, weth, amounts, SwapSide.SELL, block, pV3),
    ]);

    const lineV2: any = qV2?.[0];
    const lineV3: any = qV3?.[0];
    const destV2 = lineV2?.prices?.[1] ?? 0n;
    const destV3 = lineV3?.prices?.[1] ?? 0n;

    const bestDex = destV2 >= destV3 ? 'UniswapV2' : 'UniswapV3';
    const bestLine = bestDex === 'UniswapV2' ? lineV2 : lineV3;
    expect(bestLine).toBeDefined();

    const srcDec = String(wbtc.decimals);
    const destDec = String(weth.decimals);
    const amountStr = amounts[1].toString();
    const recipient = '0x000000000000000000000000000000000000dEaD';

    const inst: any = bestDex === 'UniswapV2' ? uniV2 : uniV3;

    let dexParam: any;
    try {
      dexParam = await inst.getDexParam(
        wbtc.address,
        weth.address,
        srcDec,
        destDec,
        amountStr,
        SwapSide.SELL,
        bestLine.data,
      );
    } catch {
      dexParam = await inst.getDexParam(
        wbtc.address,
        weth.address,
        srcDec,
        destDec,
        amountStr,
        bestLine.data,
        recipient,
      );
    }

    expect(dexParam.targetExchange).toMatch(/^0x/i);
    expect((dexParam.exchangeData ?? '').length).toBeGreaterThan(10);

    try {
      // @ts-ignore
      dexHelper?.web3Provider?.currentProvider?.removeAllListeners?.();
      // @ts-ignore
      await dexHelper?.web3Provider?.currentProvider?.disconnect?.();
    } catch {}
  });
});
