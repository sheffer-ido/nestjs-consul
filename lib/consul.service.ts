import { IConsulConfig, IConsulKeys } from './interfaces/consul-config.interface';
import { HttpService, Logger } from '@nestjs/common';
import { IConsulResponse } from './interfaces/consul-response.interface';
import { schedule } from 'node-cron';

export class ConsulService<T> {
	public configs: T = Object.create({});
	private readonly consulURL: string;
	private readonly keys: IConsulKeys<T>[] | undefined;
	private readonly token: string;

	constructor({ connection, keys, updateCron }: IConsulConfig<T>, private readonly httpService: HttpService) {
		this.consulURL = `${connection.protocol}://${connection.host}:${connection.port}/v1/kv/`;
		this.keys = keys;
		this.token = connection.token;
		this.planUpdate(updateCron);
	}

	private async getKeyFromConsul(k: IConsulKeys) {
		try {
			const { data } = await this.httpService
				.get<IConsulResponse[]>(`${this.consulURL}${String(k.key)}`, {
					headers: {
						'X-Consul-Token': this.token,
					},
				}).toPromise();
			return data;
		} catch (e) {
			if (k.required) {
				throw new Error(`Key not found ${String(k.key)}`)
			}
			Logger.warn(`Key not found ${String(k.key)}`);
			return null;
		}
	}

	private updateConfig(value: any, key: IConsulKeys) {
		try {
			const result = value !== null ? Buffer.from(value, 'base64').toString() : value;
			this.configs[key.key] = JSON.parse(result);
		} catch (e) {
			const msg = `Invalid JSON value in ${String(key.key)}`;
			if (key.required) {
				throw new Error(msg);
			}
			Logger.warn(msg);
		}
	}

	public async update(): Promise<void> {
		if(!this.keys) {
			return;
		}
		for (const k of this.keys) {
			const data = await this.getKeyFromConsul(k);
			if (data) {
				this.updateConfig(data[0].Value, k)
			}
		}
	}

	public async set<T>(key: string, value: T): Promise<boolean> {
		try {
			const { data } = await this.httpService
				.put<boolean>(`${this.consulURL}${key}`, value, {
					headers: {
						'X-Consul-Token': this.token,
					},
				})
				.toPromise();
			return data;
		} catch (e) {
			Logger.error(e);
		}
	}

	public async get<T>(key: string): Promise<T> {
		try {
			const { data } = await this.httpService
				.get<boolean>(`${this.consulURL}${key}`, {
					headers: {
						'X-Consul-Token': this.token,
					},
				})
				.toPromise();
			const result = Buffer.from(data[0].Value, 'base64').toString();
			return JSON.parse(result);
		} catch (e) {
			Logger.error(e);
		}
	}

	public async getKVBundles(key: string) {
		let data: { [k: string]: any } = {};
		data = await this.get(key);
		console.log('bindle initial');
		console.log(data);
		const rr = await this.getKVRecursive(data);
		console.log('bindle final');
		console.log(rr);
	  }

	public async getKVRecursive(bundle, counter = 0) {
		const b = Object['values'](bundle)[counter];
		const dd = await this.get(b.toString());
		bundle[Object.keys(bundle)[counter]] = JSON.stringify(dd);
		counter++;
		if (counter != Object['values'](bundle).length) {
		  return this.getKVRecursive(bundle, counter);
		}
		return bundle;
	  }

	// public async  getKVOverRide(key: string){
    //     const data = await this.get(key);
    //     // if(typeof data.route === "undefined"||typeof data.over  === "undefined"){
    //     //     console.log("has no route or over element")
    //       const org = await this.get(Object.values(data));
    //       var mrg = await this.MergeRecursive(org,data.OBJvalues(over))
    //       return mrg;

    // }

	async MergeRecursive(original, changes) {
		for (const p in changes) {
		  try {
			// Property in destination object set; update its value.
			if (changes[p].constructor == Object) {
			  original[p] = await this.MergeRecursive(original[p], changes[p]);
			} else {
			  original[p] = changes[p];
			}
		  } catch (e) {
			// Property in destination object not set; create it and set its value.
			original[p] = changes[p];
		  }
		}
		return original;
	  }

	public async delete(key: string): Promise<boolean> {
		try {
			const { data } = await this.httpService
				.delete<boolean>(`${this.consulURL}${key}`, {
					headers: {
						'X-Consul-Token': this.token,
					},
				})
				.toPromise();
			return data;
		} catch (e) {
			Logger.error(e);
		}
	}

	private planUpdate(updateCron: string | undefined) {
		if (updateCron) {
			schedule(updateCron, async () => {
				this.update()
			});
		}
	}
}
