import { scoped, Lifecycle, injectable, autoInjectable } from "tsyringe";
import { config } from "./config";
import { ConfigInterface } from "./config.interface";

@scoped(Lifecycle.ContainerScoped)
@injectable()
@autoInjectable()
export class ConfigService{
	constructor(){}

	getConfig(key: keyof ConfigInterface){
		return config[key]
	}
}