// A fake of the R2 binding with only the calls the worker makes, so the
// worker tests need no Cloudflare account.
export class MemoryBucket {
	private readonly objects = new Map<
		string,
		{ bytes: Uint8Array; contentType: string }
	>();
	failPuts = false;
	// Runs at the start of a put, so a test can act while an upload is under way.
	beforePut?: () => Promise<void>;

	async put(
		key: string,
		value: ArrayBuffer,
		options?: { httpMetadata?: { contentType?: string } },
	) {
		await this.beforePut?.();
		if (this.failPuts) throw new Error("bucket refused the put");
		this.objects.set(key, {
			bytes: new Uint8Array(value.slice(0)),
			contentType: options?.httpMetadata?.contentType ?? "",
		});
	}

	async get(key: string) {
		const object = this.objects.get(key);
		if (!object) return null;
		return {
			body: new Blob([object.bytes]).stream(),
			writeHttpMetadata(headers: Headers) {
				headers.set("content-type", object.contentType);
			},
		};
	}

	async delete(keys: string | string[]) {
		for (const key of Array.isArray(keys) ? keys : [keys])
			this.objects.delete(key);
	}

	keys() {
		return [...this.objects.keys()].sort();
	}
}
