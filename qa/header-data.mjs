// One source for the prerendered House navigation. UI actions bind this markup
// in place; changing a label never requires replacing the header after paint.
export const labels = {index:'Home', buy:'Buy $BULLEN',stats:'Stats',deepdive:'Deep Dive',tape:'The Tape',chart:'Chart',curve:'Curve',transparency:'Moderation',refer:'Referrals',referrals:'Admin',thedrop:'The Drop',giveaways:'Giveaways',objects:'House Objects',patchnotes:'House Record',lock:'Burn Reserve',ledger:'Living Ledger',passport:'Wallet Passport',rooms:'Inner Rooms',world:'World',platform:'Platform',flywheel:'Flywheel',bullensaga:'BULLENSAGA',whitepaper:'Whitepaper',goods:'Goods',dev:'Developer Record',raiders:'The Raiders',shares:'Private record','what-if-i-held':'Holding study'};
export const destinations = {goods:'/goods/',world:'/world',platform:'/platform',flywheel:'/flywheel',bullensaga:'https://bullensaga.com/',objects:'/objects.html',patchnotes:'/patchnotes.html',lock:'/lock.html',ledger:'/ledger.html',whitepaper:'/whitepaper',buy:'/buy',stats:'/stats.html',deepdive:'/deepdive',chart:'/chart.html',tape:'/tape.html',curve:'/curve.html',giveaways:'/giveaways.html',thedrop:'/thedrop.html',refer:'/refer.html',passport:'/passport.html',rooms:'/rooms.html'};
export const featured = ['goods','world','platform','flywheel'];
export const groups = [['The House',['bullensaga','objects','patchnotes','lock','ledger','whitepaper']],['$BULLEN',['buy','stats','deepdive','chart','tape','curve']],['Community',['giveaways','thedrop','refer','passport','rooms']]];
export const descriptions = {
  bullensaga:'A dark fantasy game in development',objects:'Numbered digital collectibles',patchnotes:'Releases and updates from the House',lock:'Token reserves and lock schedules',ledger:'Public events and their receipts',whitepaper:'The House system, explained',buy:'Swap for $BULLEN through Jupiter',stats:'Market, supply and burn dashboard',deepdive:'Holder age, concentration and flow',chart:'Price history and supply events',tape:'Live trades from the main pool',curve:'Supply history and verified burns',giveaways:'Campaigns, entries and draw records',thedrop:'Prize rounds funded by buy fees',refer:'Referral records and fee earnings',passport:'Look up holdings and collectibles',rooms:'Private rooms for House Key holders'
};
export const socials = [['https://x.com/bullenciagax','X Profile'],['https://bullenciaga.com/chat','X Chat'],['/telegram','Telegram'],['/discord','Discord']];
export const resources = [
['https://pump.fun/profile/bullenciagax','pump.fun'],['https://www.tensor.trade/trade/bullenciaga','Tensor'],['https://magiceden.io/marketplace/bullenciaga','Magic Eden'],['https://gravemarket.io/collection/bullenciaga','GraveMarket'],['https://www.coingecko.com/coins/bullen','CoinGecko'],['https://www.geckoterminal.com/solana/pools/9MP131fa3jir94azmVHZdwQww2Ma9aLtzQUG6CJdV6TZ','GeckoTerminal'],['https://dexscreener.com/solana/9MP131fa3jir94azmVHZdwQww2Ma9aLtzQUG6CJdV6TZ','DexScreener'],['https://www.dextools.io/app/token/bullenciaga','DEXTools'],['https://coinpaprika.com/coin/bullen-bullenciaga/','CoinPaprika'],['https://dexpaprika.com/solana/token/BULLENxRbvuwjo4DLBKBbh23cNQ4ZbpDeQKuoVXL7exN','DexPaprika'],['https://blockspot.io/coin/bullenciaga-bullen/','Blockspot']];
// Only meaningful, already-existing anchors. Hidden wallet/dialog targets are
// intentionally excluded; single-purpose tools need no empty contents menu.
export const pageSections = {
index:[['stats','Live Stats'],['nft','The Herd Collection'],['gallery','Browse The Herd'],['roadmap','Roadmap'],['faq','FAQ']],
flywheel:[['mechanism','The system'],['supply','Supply'],['collecting','Collecting'],['revenue','Revenue'],['liquidity','Liquidity'],['evidence','Evidence']],
world:[['release','Current release'],['artist-title','Explore the House']],
buy:[['swap-heading','Swap for $BULLEN'],['contract-heading','Token contract'],['routes-heading','Wallet options'],['markets-heading','Other markets']],
objects:[['objects-title','House Objects'],['issue-title','Current issue'],['claim-title','Claim record'],['key-title','The House Key'],['benefits-title','Holder benefits']],
deepdive:[['holder-age','Holder age'],['ownership','Concentration'],['flow','Token flow'],['wallet','Wallet lookup'],['methodology','Methodology']],
dev:[['record','Developer record'],['mechanics','Burn mechanics'],['receipts','Receipts']],
raiders:[['all-title','All-time leaders'],['weeks-title','Weekly records']],
'what-if-i-held':[['group-title','The study'],['your-wallet','Your wallet'],['read-heading','Reading the results'],['method','Methodology']],
patchnotes:[['goods-heading','The Goods'],['custom-heading','Custom clothing'],['benefits-heading','Holder benefits'],['commitment-heading','Back to the House'],['music-heading','One More Record'],['around-heading','Around the House'],['archive','Previous editions']],
'patchnotes-006':[['new-chapter-heading','A new chapter'],['tools-heading','Tools'],['commitments-heading','Commitments'],['community-heading','Community'],['details-heading','Details'],['archive','Previous editions']],
'patchnotes-002':[['public-heading','Public additions'],['refinements-heading','Refinements'],['operations-heading','Operations'],['archive','Previous editions']],
'patchnotes-003':[['community-heading','Community'],['collect-heading','Collecting'],['details-heading','Details'],['archive','Previous editions']],
'patchnotes-004':[['collect-heading','Collecting'],['estate-heading','The Estate'],['records-heading','Records'],['details-heading','Details'],['archive','Previous editions']],
'patchnotes-005':[['wallets-heading','Wallets'],['raiders-heading','The Raiders'],['details-heading','Details'],['archive','Previous editions']]
};
