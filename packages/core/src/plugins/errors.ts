/** A before-hook said no; `reason` is the plugin's plain-text explanation for the person who tried. */
export class PluginRejectedError extends Error {
	constructor(
		readonly plugin: string,
		readonly reason: string,
	) {
		super(`${plugin}: ${reason}`);
	}
}

/** A before-hook failed, timed out or answered nonsense. The change is refused; details go to the plugin's log only. */
export class PluginHookError extends Error {
	constructor(readonly plugin: string) {
		super(`Plugin ${plugin} could not check this change`);
	}
}
