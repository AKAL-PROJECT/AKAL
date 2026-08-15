const https = require('https');
const fs = require('fs');

https.get('https://raw.githubusercontent.com/mledoze/countries/master/countries.json', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      let result = [];
      for (const c of parsed) {
        if (c.idd && c.idd.root) {
          const root = c.idd.root;
          const suffixes = c.idd.suffixes || [''];
          const code = suffixes.length > 10 ? root : root + suffixes[0];
          const name = c.name.common;
          const cca2 = c.cca2.toLowerCase();
          result.push({ code, name, cca2 });
        }
      }
      
      result.sort((a, b) => a.name.localeCompare(b.name));
      const maList = result.filter(x => x.cca2 === 'ma');
      const others = result.filter(x => x.cca2 !== 'ma');
      const final = [...maList, ...others];
      
      const content = 'export const COUNTRY_CODES = ' + JSON.stringify(final, null, 2) + ';\n';
      fs.writeFileSync('src/lib/country-codes.ts', content, 'utf8');
      console.log('Saved ' + final.length + ' countries with cca2');
    } catch(e) {
      console.error(e);
    }
  });
}).on('error', err => console.error(err));
