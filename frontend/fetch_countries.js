const https = require('https');
const fs = require('fs');

https.get('https://restcountries.com/v3.1/all?fields=name,idd,cca2,flag', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const countries = JSON.parse(data);
      let list = countries
        .filter(c => c.idd && c.idd.root && c.flag)
        .flatMap(c => {
          const root = c.idd.root;
          const suffixes = c.idd.suffixes || [''];
          return suffixes.map(s => ({
            code: root + s,
            flag: c.flag,
            name: c.name.common,
            cca2: c.cca2
          }));
        })
        .filter(c => c.code.length <= 5) // filter out some weird ones
        .sort((a, b) => a.name.localeCompare(b.name));
      
      // Make Morocco first
      const maIndex = list.findIndex(c => c.cca2 === 'MA');
      if(maIndex > -1) {
        const ma = list.splice(maIndex, 1)[0];
        list.unshift(ma);
      }
      
      // Remove duplicates based on code + name
      const unique = [];
      const seen = new Set();
      for(const c of list) {
        const key = c.code + c.name;
        if(!seen.has(key)) {
          seen.add(key);
          unique.push({ code: c.code, flag: c.flag, name: c.name });
        }
      }

      const content = 'export const COUNTRY_CODES = ' + JSON.stringify(unique, null, 2) + ';\n';
      fs.writeFileSync('src/lib/country-codes.ts', content);
      console.log('Saved ' + unique.length + ' countries to src/lib/country-codes.ts');
    } catch(e) {
      console.error(e);
    }
  });
}).on('error', err => console.error(err.message));
