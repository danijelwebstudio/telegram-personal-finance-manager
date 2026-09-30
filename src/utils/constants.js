const LOCATIONS = {
  NS_DAILY: 'NS_DAILY',
  NS_SEF: 'NS_SEF',
  PD_SEF: 'PD_SEF',
  KARTICA: 'KARTICA'
};

const CURRENCIES = {
  RSD: 'RSD',
  EUR: 'EUR',
  BAM: 'BAM'
};

const TRANSACTION_TYPES = {
  EXPENSE: 'EXPENSE',
  INCOME: 'INCOME',
  TRANSFER_OUT: 'TRANSFER_OUT',
  TRANSFER_IN: 'TRANSFER_IN'
};

const DEBT_DIRECTIONS = {
  I_OWE: 'I_OWE',
  OWED_TO_ME: 'OWED_TO_ME'
};

const DEBT_STATUS = {
  ACTIVE: 'ACTIVE',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  SETTLED: 'SETTLED'
};

// NOVO: Nadimci za lakše kucanje komandi
const LOCATION_ALIASES = {
    'džep': 'NS_DAILY',
    'dzep': 'NS_DAILY',
    'ns sef': 'NS_SEF',
    'pd sef': 'PD_SEF',
    'prijedor': 'PD_SEF',
    'kartica': 'KARTICA'
};

// Eksportujemo SVE odjednom na dnu fajla
module.exports = {
  LOCATIONS,
  CURRENCIES,
  TRANSACTION_TYPES,
  DEBT_DIRECTIONS,
  DEBT_STATUS,
  LOCATION_ALIASES
};