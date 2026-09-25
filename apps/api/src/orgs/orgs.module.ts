import { Module } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { MembersService } from './members.service';
import { OrgMemberGuard } from './org-member.guard';
import { InviteTokenController, OrgController, OrgsController } from './orgs.controller';
import { OrgsService } from './orgs.service';

@Module({
  controllers: [OrgsController, OrgController, InviteTokenController],
  providers: [OrgsService, MembersService, InvitesService, OrgMemberGuard],
  exports: [OrgsService, MembersService, InvitesService, OrgMemberGuard],
})
export class OrgsModule {}
