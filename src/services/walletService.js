const supabase = require('../db/supabase');

// Funkcija koja vuče sve novčanike iz baze i sortira ih
async function getBalances() {
    const { data, error } = await supabase
        .from('wallets')
        .select('location, currency, balance')
        .order('location')
        .order('currency');

    if (error) {
        console.error('Greška pri dohvatanju stanja:', error);
        throw error;
    }
    return data;
}

module.exports = {
    getBalances
};