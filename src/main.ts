import {
	App,
	Editor,
	MarkdownView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
} from "obsidian";
import { reverseinsertionlink } from "./Tool";

interface MyPluginSettings {
	/** 块ID格式 */
	blockID: string;
	/** 链接的显示文本格式 */
	displayText: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	blockID: "yyyyMMddHHmmss",
	displayText: "basename",
};

export default class backwardLinkPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "backwardLinkPlugin-basename-editor-command",
			name: "显示文字为文件名",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "basename");
			},
        });
        this.addCommand({
			id: "backwardLinkPlugin-path-editor-command",
			name: "显示原样",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "path");
			},
        });
        this.addCommand({
			id: "backwardLinkPlugin-custom-editor-command",
			name: `显示文字为自定义文字：${this.settings.displayText}`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "custom");
			},
        });
        this.addCommand({
			id: "backwardLinkPlugin-foot-editor-command",
			name: "显示为脚注的形式",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "foot");
			},
		});

		this.addSettingTab(new SampleSettingTab(this.app, this));
	}

	onunload() {}

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData()
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: backwardLinkPlugin;

	constructor(app: App, plugin: backwardLinkPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("块 ID 格式")
            .setDesc(`设置块 ID 的格式，遵循 luxon 时间格式。
                obsidian块 ID 只支持大小写字母、数字和 -（减号），不能添加其他任何符号。
                `)
			.addText((text) =>
				text
					.setPlaceholder("yyyyMMddHHmmss")
					.setValue(this.plugin.settings.blockID)
					.onChange(async (value) => {
						if (value.trim() == "") {
							value = "yyyyMMddHHmmss";
						}
						this.plugin.settings.blockID = value;
						await this.plugin.saveSettings();
					})
			);
		new Setting(containerEl)
			.setName("自定义链接的显示文本")
			.setDesc(
				"设置插入链接自定义文本，所有插入的链接都会以这个文本为显示文本"
			)
			.addText((text) =>
				text
					.setPlaceholder("^")
					.setValue(this.plugin.settings.displayText)
					.onChange(async (value) => {
						this.plugin.settings.displayText = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
