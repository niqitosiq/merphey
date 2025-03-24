import { TherapeuticPlan as PrismaTherapeuticPlan } from '@prisma/client'
import { PlanVersion, PlanContent } from './PlanVersion'
import { v4 as uuidv4 } from 'uuid'

/**
 * Domain entity representing a therapeutic plan for a user
 * Core aggregate root for the therapeutic planning part of the system
 */
export class TherapeuticPlan
	implements
		Omit<
			PrismaTherapeuticPlan,
			'versions' | 'currentVersion' | 'conversations'
		>
{
	constructor(
		public readonly id: string,
		public readonly userId: string,
		public versions: PlanVersion[],

		public currentVersion: PlanVersion | null,
		public currentVersionId: string | null,

		public readonly createdAt: Date,
		public readonly updatedAt: Date
	) {}

	/**
	 * Creates a new version of the therapeutic plan
	 */
	createNewVersion(content: PlanContent): PlanVersion {
		const nextVersion = this.versions.length + 1
		const version = new PlanVersion(
			uuidv4(),
			this.id,
			this.currentVersionId,
			content,
			null,
			nextVersion,
			new Date()
		)

		return version
	}

	/**
	 * Gets the current active goals from the current version
	 */
	getCurrentGoals() {
		if (!this.currentVersion) {
			return []
		}
		return this.currentVersion.getContent().goals
	}

	/**
	 * Gets recommended techniques from the current version
	 */
	getRecommendedTechniques() {
		if (!this.currentVersion) {
			return []
		}
		return this.currentVersion.getContent().techniques
	}

	/**
	 * Gets the version history of the plan
	 */
	getVersionHistory(): PlanVersion[] {
		return [...this.versions].sort((a, b) => b.version - a.version)
	}

	/**
	 * Validates if the plan needs human review based on recent changes
	 */
	requiresHumanReview(): boolean {
		if (!this.currentVersion) {
			return false
		}
		return this.currentVersion.requiresHumanReview()
	}

	/**
	 * Gets the progress metrics for the current version
	 */
	getProgressMetrics(): { [key: string]: any } {
		if (!this.currentVersion) {
			return {}
		}
		return this.currentVersion.getContent().metrics || {}
	}

	/**
	 * Updates the current version with new content
	 */
	updateCurrentVersion(content: PlanContent): void {
		if (!this.currentVersion) {
			throw new Error('No current version exists')
		}
		this.createNewVersion(content)
	}

	/**
	 * Rolls back to a specific version
	 */
	rollbackToVersion(versionId: string): void {
		const targetVersion = this.versions.find((v) => v.id === versionId)
		if (!targetVersion) {
			throw new Error('Version not found')
		}
		this.currentVersion = targetVersion
		this.currentVersionId = targetVersion.id
	}

	/**
	 * Updates the current version reference
	 */
	setCurrentVersion(version: PlanVersion): void {
		if (!this.versions.some((v) => v.id === version.id)) {
			throw new Error('Version must belong to this plan')
		}
		this.currentVersion = version
		this.currentVersionId = version.id
	}

	// /**
	//  * Gets all conversations using this plan
	//  */
	// getConversations(): Conversation[] {
	//   return this.conversations;
	// }
}
