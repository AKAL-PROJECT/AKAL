import urllib.request
import json

url = 'https://raw.githubusercontent.com/mledoze/countries/master/countries.json'
req = urllib.request.Request(url)
with urllib.request.urlopen(req) as response:
    data = json.loads(response.read().decode('utf-8'))

result = []
for c in data:
    if 'idd' in c and c['idd'].get('root'):
        root = c['idd']['root']
        suffixes = c['idd'].get('suffixes', [''])
        if len(suffixes) > 10:
            code = root
        else:
            code = root + suffixes[0]
        
        name = c['name']['common']
        flag = c.get('flag', '')
        cca2 = c.get('cca2', '')
        if flag:
            result.append({'code': code, 'flag': flag, 'name': name, 'cca2': cca2})

result.sort(key=lambda x: x['name'])
# Move Morocco to top
ma_list = [x for x in result if x['cca2'] == 'MA']
others = [x for x in result if x['cca2'] != 'MA']
final_list = ma_list + others

output = "export const COUNTRY_CODES = " + json.dumps([{'code': x['code'], 'flag': x['flag'], 'name': x['name']} for x in final_list], indent=2, ensure_ascii=False) + ";\n"
with open('src/lib/country-codes.ts', 'w', encoding='utf-8') as f:
    f.write(output)
print(f"Saved {len(final_list)} countries")
