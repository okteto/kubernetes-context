import * as vscode from 'vscode';
import * as k8s from '@kubernetes/client-node';
import * as home from 'user-home';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
	const commandId = 'okteto.selectKubernetesContext';
	const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	status.command = commandId;
	context.subscriptions.push(status);
	setInterval(()=>{
		refreshContext(status);
	}, 500);

	context.subscriptions.push(vscode.commands.registerCommand(commandId, ()=>{
		const contexts = getContexts();
		if (!contexts) {
			vscode.window.showErrorMessage(`Couldn't load your Kubernetes context`);
			return;
		}

		vscode.window.showQuickPick(contexts, {canPickMany: false, placeHolder: 'Select your Kubernetes context'}).then((choice) => {
			if (choice) {
				const context = choice.split('/')[0];
				updateContext(context).then(()=>{
					refreshContext(status);
				}, (reason) => {
					vscode.window.showErrorMessage(`Couldn't update your Kubernetes context: ${reason.message}`);
				});
				
			}
		});
	}));
}

function refreshContext(status: vscode.StatusBarItem) {
	const ktx = getCurrentContext();
		if (!ktx) {
			status.hide();
			return;
		} 

		status.text = getText(ktx.name.substring(0, 20), ktx.name.substring(0, 20));
		status.tooltip = getText(ktx.name, ktx.namespace);
		status.show();
}

function getCurrentContext(): {name: string, namespace:string} | undefined {
    try{
        const kc = new k8s.KubeConfig();
        kc.loadFromDefault();
    
        const current = kc.getCurrentContext();
        const ctx = kc.getContextObject(current);
        const ns =  ctx ? ctx.namespace : '';
        return {
            name: current,
            namespace: ns? ns : ''
        };
    }catch(err) {
        console.error(`failed to get the kubernetes context: ${err}`);
        return undefined;
    }
}

function getContexts(): string[] | undefined {
    try{
        const kc = new k8s.KubeConfig();
		kc.loadFromDefault();
		return kc.getContexts().map((value) => {
			return getText(value.name, value.namespace);
		});
    }catch(err) {
        console.error(`failed to get the kubernetes context: ${err}`);
		return undefined;
    }
}

function getText(context: string, namespace: string|undefined): string {
	if (!namespace) {
		return context;
	}

	return `${context}/${namespace}`;
}

function updateContext(context: string): Promise<string> {
	return new Promise<string>((resolve, reject) => {
		const config = getKubeconfigFile();
		fs.readFile(config, {encoding: 'utf-8'}, (err, data)=>{
			if (err) {
				reject(err.message);
				return;
			}

			const doc = yaml.safeLoad(data);
			if (!doc) {
				reject(`${config} is not a valid yaml file`);
				return;
			}

			doc['current-context'] = context;
			fs.writeFile(config, yaml.safeDump(doc), (err)=>{
				if (err) {
					reject(`couldn't update ${config}: ${err.message}`);
					return;
				}

				resolve();
				return;
			});
		});
	});
}

function getKubeconfigFile() :string {
	if (process.env.KUBECONFIG && process.env.KUBECONFIG.length > 0) {
		const files = process.env.KUBECONFIG.split(path.delimiter);
		return files[0];
	} 

	return path.join(home, ".kube", "config");
}

// this method is called when your extension is deactivated
export function deactivate() {}
