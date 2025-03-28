import { PrismaClient } from "@prisma/client";
import { injectable, Lifecycle, scoped } from "tsyringe";


@injectable()
@scoped(Lifecycle.ContainerScoped)
export class PrismaService extends PrismaClient{

}