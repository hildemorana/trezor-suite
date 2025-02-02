import { CoinFiatRates, FiatRateKey, Rate, RateType } from '@suite-common/wallet-types';

export type FiatRatesState = Record<RateType, Record<FiatRateKey, Rate>>;

export type FiatRatesRootState = {
    wallet: {
        fiat: FiatRatesState;
    };
};

export interface FiatRatesStateLegacy {
    coins: CoinFiatRates[];
}
