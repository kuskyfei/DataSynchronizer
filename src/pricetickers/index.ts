
import * as _ from 'lodash'
import { BaseDB } from '../database'
import {CCXT_API} from '../exchange/ccxt_controller'
import {logger} from '../logger'


class PriceTickers {
  exchanges: string[]
  update_frequency: number
  constructor() {
    this.exchanges = [];
    this.update_frequency = 30 * 1000; // in ms
  }

  async start(exchanges:string[]) {
    try {
      this.exchanges = exchanges;

      await this.update_loop();
    } catch (e) {
      logger.error('PriceTickers start ', e);
    }
  }

  async update_loop() {
    try {
      let update_promises = [];

      for(let exchange of this.exchanges) {
        update_promises.push(this.update(exchange));
      }

      if (update_promises.length > 0) {
        logger.verbose(`Marketdata Update loop`);
        await Promise.all(update_promises);
      }
    } catch (e) {
      logger.error('Marketdata Update ', e);
    } finally {
      setTimeout(() => {
        this.update_loop();
      }, this.update_frequency);
    }
  }

  async update(exchange:string) {
    // Looking after new tradepairs!
    try {
      let price_tickers:any[] = [];

      price_tickers = await CCXT_API.get_pricetickers(exchange);

      let time = Date.now();

      if (_.isObject(price_tickers) === false) {
        return;
      }
      // Add exchange,time,quotevolume into PriceTickers
      price_tickers = Object.values(price_tickers).map(elem => {
        elem.exchange = exchange;
        elem.timestamp = time;

        // Calculate quoteVolume where it is missing
        if (elem.quoteVolume == undefined && elem.baseVolume > 0) {
          elem.quoteVolume = elem.baseVolume * ((elem.high + elem.low) / 2);
        }

        return elem;
      });

      /* TODO remove tickers with undefinied values */
      price_tickers = price_tickers.filter(elem => elem.high != undefined);

      if (price_tickers.length > 0) {
        await this.replace_db(price_tickers);
      }

      return;
    } catch (e) {
      logger.error('Update_tradepairs ', e);
    }
  }

  async replace_db(price_tickers: any[]) {
    try {
      // Stringify JSONs for database storage
      price_tickers = price_tickers.map(e => {
        // Convert to simple array
        return [e.exchange, e.symbol, e.timestamp, e.high, e.low, e.bid, e.ask, e.last, e.change, e.percentage, e.baseVolume, e.quoteVolume, JSON.stringify(e.info)];
      });

      await BaseDB.query(
        'REPLACE INTO `price_tickers` (`exchange`, `symbol`, `timestamp`, `high`, `low`, `bid`, `ask`, `last`, `change`, `percentage`, `baseVolume`, `quoteVolume`, `info`) VALUES ?',
        [price_tickers],
      );

      return;
    } catch (e) {
      logger.error('Error', e);
    }
  }
}

module.exports = new PriceTickers();
