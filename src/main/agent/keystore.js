const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT_LENGTH = 32;
const ITERATIONS = 100000;

class KeyStore {
  constructor(userDataPath) {
    this.filePath = path.join(userDataPath, '.keystore.enc');
    this.keys = {};
    this.masterSecret = null;
  }

  /**
   * Derive a machine-specific encryption key.
   * Uses a combination of username, hostname, and a persisted salt
   * so keys are bound to this machine + user account.
   */
  _deriveMasterKey(salt) {
    const machineId = `${os.userInfo().username}@${os.hostname()}:${os.homedir()}`;
    return crypto.pbkdf2Sync(machineId, salt, ITERATIONS, KEY_LENGTH, 'sha512');
  }

  _encrypt(plaintext, masterKey) {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return { iv, encrypted, tag };
  }

  _decrypt(encrypted, iv, tag, masterKey) {
    const decipher = crypto.createDecipheriv(ALGORITHM, masterKey, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf-8');
  }

  async initialize() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath);
        // File format: [salt:32][iv:16][tag:16][encrypted:rest]
        if (raw.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
          throw new Error('Corrupt keystore');
        }

        const salt = raw.subarray(0, SALT_LENGTH);
        const iv = raw.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = raw.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const encrypted = raw.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

        this.masterSecret = salt;
        const masterKey = this._deriveMasterKey(salt);

        const decrypted = this._decrypt(encrypted, iv, tag, masterKey);
        this.keys = JSON.parse(decrypted);
      } else {
        this.masterSecret = crypto.randomBytes(SALT_LENGTH);
        this.keys = {};
        await this._persist();
      }
    } catch (err) {
      console.error('[KeyStore] Failed to load, resetting:', err.message);
      this.masterSecret = crypto.randomBytes(SALT_LENGTH);
      this.keys = {};
      await this._persist();
    }
  }

  async _persist() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const masterKey = this._deriveMasterKey(this.masterSecret);
      const plaintext = JSON.stringify(this.keys);
      const { iv, encrypted, tag } = this._encrypt(plaintext, masterKey);

      // Write: salt + iv + tag + encrypted
      const output = Buffer.concat([this.masterSecret, iv, tag, encrypted]);
      fs.writeFileSync(this.filePath, output);
    } catch (err) {
      console.error('[KeyStore] Failed to persist:', err.message);
    }
  }

  /**
   * Store an API key for a provider.
   * @param {string} provider - e.g. 'openai', 'anthropic', 'google', 'deepseek'
   * @param {string} apiKey - the raw API key
   */
  async setKey(provider, apiKey) {
    this.keys[provider] = apiKey;
    await this._persist();
  }

  /**
   * Retrieve a stored API key for a provider.
   * @param {string} provider
   * @returns {string|null}
   */
  getKey(provider) {
    return this.keys[provider] || null;
  }

  /**
   * Remove a stored API key.
   * @param {string} provider
   */
  async removeKey(provider) {
    delete this.keys[provider];
    await this._persist();
  }

  /**
   * List which providers have stored keys (without revealing the keys).
   * @returns {Object} map of provider → masked key
   */
  listKeys() {
    const result = {};
    for (const [provider, key] of Object.entries(this.keys)) {
      if (key && key.length > 8) {
        result[provider] = key.slice(0, 4) + '••••' + key.slice(-4);
      } else if (key) {
        result[provider] = '••••••••';
      }
    }
    return result;
  }

  /**
   * Check if a provider has a stored key.
   * @param {string} provider
   * @returns {boolean}
   */
  hasKey(provider) {
    return !!this.keys[provider];
  }

  close() {
    // Clear keys from memory
    this.keys = {};
    this.masterSecret = null;
  }
}

module.exports = { KeyStore };
