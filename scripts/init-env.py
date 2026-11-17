"""Generate local secrets once; never print credentials and never overwrite an existing .env."""
import secrets
from pathlib import Path
p=Path('.env')
if p.exists():raise SystemExit('.env já existe; preservado.')
s=Path('.env.example').read_text().replace('replace-with-generated-password',secrets.token_hex(24)).replace('replace-with-at-least-48-random-characters-before-starting',secrets.token_hex(48))
with p.open('x') as f:f.write(s)
p.chmod(0o600)
print('.env criado com credenciais aleatórias.')
