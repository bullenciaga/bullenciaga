// One SOL-denominated strategy book, compared with the same funding held in BULLEN.
// Event tuple: [Unix time, buy=1/sell=0, BULLEN quantity, all-in SOL, pool mark, signature].
export const median = values => {
  const a = [...values].sort((x, y) => x - y);
  return a.length ? (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2 : null;
};

export function calculate(wallet, price, endTime) {
  if (!(price > 0) || !Number.isFinite(price)) throw new Error('Missing valuation price');
  let tokens = wallet.openingTokens || 0, basis = wallet.openingValue || 0;
  let capital = basis, holdTokens = tokens, cash = 0, realized = 0, fresh = 0;
  let buys = 0, sells = 0, cycles = 0, wasSell = false, saleGains = 0, saleLosses = 0;
  let buyCost = 0, saleProceeds = 0, matchedSales = 0, matchedBuys = 0;
  const lots = tokens > 0 ? [{q:tokens, cost:basis}] : [], exitLots = [], journal = [], points = [];
  if (capital > 0) points.push({time:wallet.start, actual:0, hold:0});
  for (const [time, buy, quantity, sol, mark, signature] of wallet.events) {
    if (!(quantity > 0) || !(sol > 0) || !(mark > 0) || ![time,quantity,sol,mark].every(Number.isFinite)) throw new Error('Invalid trade');
    let closed = null;
    if (buy) {
      buys++; if (wasSell) cycles++;
      const added = Math.max(0, sol - cash);
      capital += added; fresh += added; holdTokens += quantity * added / sol;
      cash = Math.max(0, cash - sol); tokens += quantity; basis += sol; buyCost += sol;
      lots.push({q:quantity,cost:sol});
      let remaining = quantity;
      while (remaining > 1e-7 && exitLots.length) {
        const lot = exitLots[0], q = Math.min(remaining,lot.q);
        matchedSales += q * lot.unit; matchedBuys += q * sol / quantity;
        remaining -= q; lot.q -= q; if (lot.q < 1e-7) exitLots.shift();
      }
    } else {
      if (quantity > tokens + 0.000004) throw new Error('Sale exceeds verified inventory');
      sells++; cash += sol; saleProceeds += sol; tokens -= quantity;
      let remaining = quantity, cost = 0;
      while (remaining > 1e-7 && lots.length) {
        const lot = lots[0], q = Math.min(remaining,lot.q), used = lot.cost * q / lot.q;
        cost += used; remaining -= q; lot.q -= q; lot.cost -= used;
        if (lot.q < 1e-7) lots.shift();
      }
      if (remaining > 0.000004) throw new Error('Missing acquisition basis');
      basis -= cost; closed = sol - cost; realized += closed;
      if (closed > 1e-9) saleGains++; else if (closed < -1e-9) saleLosses++;
      exitLots.push({q:quantity,unit:sol/quantity});
    }
    wasSell = !buy;
    if (Math.abs(tokens) < 1e-7) tokens = 0;
    if (Math.abs(basis) < 1e-10) basis = 0;
    journal.push({time,buy:!!buy,quantity,sol,closed,signature});
    points.push({time,actual:100*((cash+tokens*mark)/capital-1),hold:100*(holdTokens*mark/capital-1)});
  }
  if (!(capital > 0)) throw new Error('Missing strategy funding');
  const unsoldValue = tokens * price, unrealized = unsoldValue - basis;
  const actual = cash + unsoldValue, held = holdTokens * price;
  const pnl = realized + unrealized, holdPnl = held - capital;
  if (Math.abs(pnl - (actual-capital)) > 1e-7 * Math.max(1,capital)) throw new Error('P&L reconciliation failed');
  const actualReturn = 100*pnl/capital, holdReturn = 100*holdPnl/capital, edge = holdReturn-actualReturn;
  points.push({time:endTime,actual:actualReturn,hold:holdReturn});
  return {tokens,basis,cash,capital,fresh,buyCost,saleProceeds,buys,sells,cycles,saleGains,saleLosses,
    realized,unrealized,unsoldValue,pnl,holdPnl,actual,held,holdTokens,actualReturn,holdReturn,edge,
    matchedSales,matchedBuys,buybackSaving:matchedSales-matchedBuys,
    rebuyPremium:matchedSales>0?100*(matchedBuys/matchedSales-1):null,
    spanDays:(wallet.events.at(-1)[0]-wallet.events[0][0])/86400,
    journal,points};
}

export function inCohort(w, cohort='repeat') {
  if (w.capital < .1 || w.sells < 1) return false;
  if (cohort === 'sellers') return true;
  if (w.spanDays < 1) return false;
  if (cohort === 'active') return true;
  if (cohort === 'frequent') return w.buys+w.sells >= 10 && w.cycles >= 2;
  return w.buys >= 2 && w.sells >= 2;
}

export function summarize(rows) {
  const matched = rows.filter(w=>w.matchedSales>0);
  return {n:rows.length, holdWins:rows.filter(w=>w.edge>1e-5).length,
    tradeWins:rows.filter(w=>w.edge < -1e-5).length,
    ties:rows.filter(w=>Math.abs(w.edge)<=1e-5).length,
    actualReturn:median(rows.map(w=>w.actualReturn)),holdReturn:median(rows.map(w=>w.holdReturn)),
    edge:median(rows.map(w=>w.edge)),trades:median(rows.map(w=>w.buys+w.sells)),
    buybackPremium:median(matched.map(w=>w.rebuyPremium)),matchedWallets:matched.length,
    dearerBuybacks:matched.filter(w=>w.rebuyPremium>0).length};
}
