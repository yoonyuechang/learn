p = 'src/lib/ai.ts'
s = open(p, encoding='utf-8').read()

# Fix headline regexes: the charclass contains a single quote which prematurely
# terminates the regex literal. Move quote stripping to a separate replace.
old_block = """  const cleaned = result
    .replace(/^[\\s"'「「」」『』()\\[\\]【】*_]+/g, '')
    .replace(/[\\s"'「「」」『』()\\[\\]【】*_]+$/g, '')
    .replace(/[#*]/g, '')
    .replace(/\\n/g, ' ')
    .trim()"""

new_block = """  const cleaned = result
    .replace(/^[\\s"「「」」『』()\\[\\]【】*_]+/g, '')
    .replace(/[\\s"「「」」『』()\\[\\]【】*_]+$/g, '')
    .replace(/['"]/g, '')
    .replace(/[#*]/g, '')
    .replace(/\\n/g, ' ')
    .trim()"""

assert old_block in s, "old_block not found"
s = s.replace(old_block, new_block)

old_safe = "    const t = s.replace(/^[\\s\"'「「」」『』()\\[\\]【】*_]+/g, '').trim()  // 혹시 남은 인용부호 제거"
new_safe = "    const t = s.replace(/^[\\s\"「「」」『』()\\[\\]【】*_]+/g, '').replace(/['\"]/g, '').trim()  // 혹시 남은 인용부호 제거"
assert old_safe in s, "old_safe not found"
s = s.replace(old_safe, new_safe)

open(p, 'w', encoding='utf-8').write(s)
print('headline regexes fixed')
