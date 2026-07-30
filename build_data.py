"""
從 客戶清單明細表.xls / 拜訪分類.xlsx / 產品檔.xlsx 重新產生 data.js
用法: python build_data.py
"""
import pandas as pd
import json

cust = pd.read_excel('客戶清單明細表.xls')
cust = cust.fillna('')
cust.columns = [c.strip() for c in cust.columns]

reps = []
rep_seen = set()
customers = []
cust_seen = {}
for _, row in cust.iterrows():
    code = str(row['業代碼']).strip()
    name = str(row['員工姓名']).strip()
    if code not in rep_seen:
        rep_seen.add(code)
        reps.append({'code': code, 'name': name})
    ckey = (code, str(row['客戶代號']).strip())
    if ckey not in cust_seen:
        cust_seen[ckey] = {
            'repCode': code,
            'code': str(row['客戶代號']).strip(),
            'name': str(row['客戶名稱']).strip(),
            'contacts': []
        }
        customers.append(cust_seen[ckey])
    cn = str(row['聯絡人姓名']).strip()
    if cn:
        cust_seen[ckey]['contacts'].append({
            'name': cn,
            'dept': str(row['科別']).strip(),
            'title': str(row['職稱']).strip(),
            'level': str(row['級別']).strip(),
        })

reps.sort(key=lambda r: r['code'])
customers.sort(key=lambda c: (c['repCode'], c['name']))

visit = pd.read_excel('拜訪分類.xlsx', header=None)
visit_types = [str(v).strip() for v in visit.iloc[:, 0].dropna().tolist()]

prod = pd.read_excel('產品檔.xlsx')
prod = prod.fillna('')
products = []
categories = []
cat_seen = set()
for _, row in prod.iterrows():
    c = str(row['類別']).strip()
    if c not in cat_seen:
        cat_seen.add(c)
        categories.append(c)
    products.append({
        'category': c,
        'series': str(row['產品系列']).strip(),
        'name': str(row['產品名稱']).strip(),
    })

with open('data.js', 'w', encoding='utf-8') as f:
    f.write('// 自動由 客戶清單明細表.xls / 拜訪分類.xlsx / 產品檔.xlsx 產生，重新產生請執行 build_data.py\n')
    f.write('window.REPS = ' + json.dumps(reps, ensure_ascii=False) + ';\n')
    f.write('window.CUSTOMERS = ' + json.dumps(customers, ensure_ascii=False) + ';\n')
    f.write('window.VISIT_TYPES = ' + json.dumps(visit_types, ensure_ascii=False) + ';\n')
    f.write('window.PRODUCT_CATEGORIES = ' + json.dumps(categories, ensure_ascii=False) + ';\n')
    f.write('window.PRODUCTS = ' + json.dumps(products, ensure_ascii=False) + ';\n')

print('data.js 已更新：', len(reps), '位業務代表,', len(customers), '家客戶,', len(products), '項產品')
