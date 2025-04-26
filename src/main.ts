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
import { insertblockLink, markblockLink, reverseinsertionlink } from "./Tool";

interface MyPluginSettings {
	/** 块ID格式 */
	blockID: string;
	/** 链接的显示文本格式 */
    displayText: string;
    /** 重命名当前链接 */
    renameLink: boolean;
    /** 当前根据当前块ID生成的的链接 */
    blockLinkMark: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	blockID: "yyyyMMddHHmmss",
    displayText: "^",
    renameLink: true,
    blockLinkMark:"",
};

export default class backwardLink extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addCommand({
			id: "backwardLink-basename-editor-command",
			name: "以文件名形式在链接目标的块末尾插入反向链接",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "basename");
			},
        });
        this.addCommand({
			id: "backwardLink-path-editor-command",
			name: "以 Obsidian 默认形式在链接目标的块末尾插入反向链接",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "path");
			},
        });
        this.addCommand({
			id: "backwardLink-custom-editor-command",
			name: `以自定义文字为 ${this.settings.displayText} 在链接目标的块末尾插入反向链接`,
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "custom");
			},
        });
        this.addCommand({
			id: "backwardLink-foot-editor-command",
			name: "以脚注形式在链接目标的块末尾插入反向链接",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				reverseinsertionlink(this, editor, "foot");
			},
		});
        this.addCommand({
			id: "backwardLink-mark-blockLink-command",
			name: "记录当前块的块链接",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				markblockLink(this, editor);
			},
        });
        this.addCommand({
			id: "backwardLink-insert-blockLink-command",
			name: "在光标处插入记录中的块链接",
			editorCallback: (editor: Editor, view: MarkdownView) => {
				insertblockLink(this, editor);
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
	plugin: backwardLink;

	constructor(app: App, plugin: backwardLink) {
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
        new Setting(containerEl)
			.setName("更改当前链接的显示文本")
			.setDesc(
				"执行命令的同时，为当前光标处的链接添加显示文   本"
			)
			.addToggle((toggle) =>
				toggle
					.setTooltip("开启重命名块链接功能")
					.setValue(this.plugin.settings.renameLink)
					.onChange(async (value) => {
						this.plugin.settings.renameLink = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
