//
import CConverter, { OHLCV } from 'candlestick-convert';
import { parentPort } from 'worker_threads';

import { logger } from '../logger';

import ExchangeDB from '../database/queries';
import { TradepairQueries } from '../tradepairs/tradepairs';
import { util } from '../utils';
import { isArray } from 'util';

const DEFAULT_CANDLE_INTERVAL = 60;

if (parentPort) {
  // Convert Trades to Candlestick(base_candletime) and save them
  parentPort.on('message', snapshotTime => {
    setImmediate(async () => {
      try {
        // Select all tradepairs
        const tradepairs = await TradepairQueries.select_tradepairs_all();

        if (isArray(tradepairs)) {
          for (const tradepair of tradepairs) {
            if (tradepair) {
              try {
                const { exchange, symbol } = tradepair as any;

                // Table check
                const candlestickTableName = util.candlestick_name(exchange, symbol, DEFAULT_CANDLE_INTERVAL);

                await ExchangeDB.candlestick_table_check(candlestickTableName);

                // Get last Candle time
                const lastUpdateTime = await ExchangeDB.candlestick_lastTime(candlestickTableName);

                // Get Trades
                const tradeTableName = util.trades_name(exchange, symbol);

                const trades = await ExchangeDB.trades_select(tradeTableName, lastUpdateTime);

                // Avoid some trades error
                if (Array.isArray(trades)) {
                  // Convert candles
                  const candlesticks = CConverter.trade_to_candle(trades, DEFAULT_CANDLE_INTERVAL);

                  const candlestickArray = candlesticks.map((e: OHLCV) => [e.time, e.open, e.high, e.low, e.close, e.volume]);

                  await ExchangeDB.candlestick_replace(candlestickTableName, candlestickArray);
                }
              } catch (e) {
                logger.error('Worker thread error', e);
              }
            }
          }
        }
      } catch (e) {
        logger.error('Worker thread error', e);
      } finally {
        if (parentPort) {
          parentPort.postMessage(snapshotTime);
        }
      }
    });
  });
}
