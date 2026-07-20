'use strict';

const {
  addClubMembershipForUser,
  formatUserClubs,
  setActiveClubForUser,
} = require('../../../utils/coach-clubs');

const USER_UID = 'plugin::users-permissions.user';

const formatPersonalRecord = (record) => ({
  id: record.id,
  documentId: record.documentId,
  time: record.time,
  achievedAt: record.achievedAt,
  distance: record.distance
    ? {
        id: record.distance.id,
        documentId: record.distance.documentId,
        name: record.distance.name,
      }
    : null,
});

const formatMemberDetail = (member) => ({
  id: member.id,
  documentId: member.documentId,
  name: member.name,
  lastname: member.lastname,
  email: member.email,
  avatar: member.avatar
    ? {
        id: member.avatar.id,
        url: member.avatar.url,
      }
    : null,
  personal_record: Array.isArray(member.personal_record)
    ? member.personal_record
        .sort(
          (firstRecord, secondRecord) =>
            new Date(secondRecord.achievedAt).getTime() -
            new Date(firstRecord.achievedAt).getTime()
        )
        .map(formatPersonalRecord)
    : [],
});

module.exports = {
  async register(ctx) {
    const {
      name,
      role,
      gender,
      email,
      password,
      birthdate,
      avatar,
      club,
      weight,
      height,
      lastname,
      username
    } = ctx.request.body;

    if (
      !name ||
      !role ||
      !email ||
      !password ||
      !lastname ||
      !username
    ) {
      return ctx.badRequest('Missing required fields');
    }

    const formatedEmail = email.toLowerCase()
    const formattedBirthdate = birthdate ? new Date(birthdate).toISOString().split('T')[0] : null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return ctx.badRequest('Invalid email format');
    }

    try {
      // Buscar si el usuario ya existe
      const existingUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({
          where: { email },
        });

      if (existingUser) {
        return ctx.badRequest('Email is already taken');
      }

      const roleData = await strapi
        .query('plugin::users-permissions.role')
        .findOne({
          where: { name: role },
        });

      if (!roleData) {
        return ctx.badRequest('Role not found');
      }

      const roleId = roleData.id; // Obtener el ID del rol

      try {
        const userData: any = {
          name,
          role: roleId, // Pasar el ID del rol
          email: formatedEmail,
          password,
          club,
          avatar,
          username,
          provider: 'local',
        };
        
        // Add optional fields only if provided
        if (gender) {
          userData.gender = gender;
        }
        if (formattedBirthdate) {
          userData.birthdate = formattedBirthdate;
        }
        if (weight) {
          userData.weight = weight;
        }
        if (height) {
          userData.height = height;
        }
        
        const user = await strapi.plugins[
          'users-permissions'
        ].services.user.add(userData);

        if (club) {
          const clubId =
            typeof club === 'object' ? club.id || club.connect?.[0]?.id : club;
          if (clubId) {
            try {
              await strapi.db.query(USER_UID).update({
                where: { id: user.id },
                data: {
                  clubs: {
                    connect: [{ id: Number(clubId) }],
                  },
                },
              });
            } catch (syncError) {
              console.error('Failed to sync clubs membership on register', syncError);
            }
          }
        }

        const refreshed = await strapi.db.query(USER_UID).findOne({
          where: { id: user.id },
          populate: { club: true, clubs: true, role: true },
        });

        const sanitizedUser = {
          id: refreshed.id,
          email: refreshed.email,
          club: refreshed.club,
          clubs: refreshed.clubs,
          birthdate: refreshed.birthdate,
          avatar: refreshed.avatar,
          weight: refreshed.weight,
          height: refreshed.height,
          lastname: refreshed.lastname,
          name: refreshed.name,
          role: refreshed.role,
          username: refreshed.username
        };

        return ctx.send(sanitizedUser);
      } catch (error) {
        console.log(error);
        return ctx.badRequest('Error registering user');
      }
    } catch (error) {
      return ctx.badRequest('Error registering user');
    }
  },
  async find(ctx) {
    try {
      const page = parseInt(ctx.query?.pagination?.page || 1, 10);
      const pageSize = parseInt(ctx.query?.pagination?.pageSize || 10, 10);
      const start = (page - 1) * pageSize;
  
      const filters = ctx.query.filters || {};
  
      const users = await strapi.entityService.findMany('plugin::users-permissions.user', {
        filters,
        populate: {
          club: true,
          avatar: {
            fields: ['url'],
          },
          role: {
            fields: ['name'],
          },
        },
        sort: ctx.query.sort || ['createdAt:desc'],
        limit: pageSize,
        start,
      });
  
      const total = await strapi.db.query('plugin::users-permissions.user').count({
        where: filters,
      });
  
      return {
        data: users,
        meta: {
          pagination: {
            page,
            pageSize,
            pageCount: Math.ceil(total / pageSize),
            total,
          },
        },
      };
    } catch (error) {
      console.error(error);
      return ctx.internalServerError('Something went wrong');
    }
  },
  async findOne(ctx) {
    const user = ctx.state.user;
    const id = Number(ctx.params.id);

    if (!user) {
      return ctx.unauthorized('Authentication required');
    }

    if (!Number.isInteger(id) || id <= 0) {
      return ctx.badRequest('User is required');
    }

    const currentUser = await strapi.db.query(USER_UID).findOne({
      where: {
        id: user.id,
      },
      populate: {
        club: true,
      },
    });

    const member = await strapi.db.query(USER_UID).findOne({
      where: {
        id,
      },
      populate: {
        avatar: true,
        club: true,
        personal_record: {
          populate: {
            distance: true,
          },
        },
      },
    });

    if (!member) {
      return ctx.notFound('User not found');
    }

    if (currentUser?.club?.id && member.club?.id !== currentUser.club.id) {
      return ctx.notFound('User not found');
    }

    return ctx.send(formatMemberDetail(member));
  },
  async update(ctx) {
    const { id } = ctx.params;
    const {
      name,
      role,
      gender,
      email,
      birthdate,
      avatar,
      club,
      weight,
      height,
      lastname,
    } = ctx.request.body;
  
    if (
      !name &&
      !role &&
      !gender &&
      !email &&
      !birthdate &&
      !avatar &&
      !club &&
      !weight &&
      !height &&
      !lastname
    ) {
      return ctx.badRequest('No fields to update');
    }
  
    try {
      // Verificamos que el usuario exista
      const existingUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({ where: { id } });
  
      if (!existingUser) {
        return ctx.notFound('User not found');
      }
      const updatedUserData: {
        name?: string;
        gender?: string;
        email?: string;
        birthdate?: string;
        avatar?: object;
        club?: object;
        weight?: number;
        height?: number;
        lastname?: string;
        // role?: number;
      } = {};

      if (name) updatedUserData.name = name;
      if (gender) updatedUserData.gender = gender;
      if (email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
          return ctx.badRequest('Invalid email format');
        }
        updatedUserData.email = email;
      }
      if (birthdate) {
        updatedUserData.birthdate = new Date(birthdate).toISOString().split('T')[0];
      }
      if (avatar) {
        const avatarId = typeof avatar === 'object' ? avatar.id : avatar;
        const avatarFile = await strapi
          .query('plugin::upload.file')
          .findOne({ where: { id: avatarId } });
        const allowedAvatarMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

        if (!avatarFile || !allowedAvatarMimeTypes.includes(avatarFile.mime)) {
          return ctx.badRequest('Only JPG, PNG and WebP avatars are allowed');
        }

        updatedUserData.avatar = avatar;
      }
      if (club) updatedUserData.club = club;
      if (weight) updatedUserData.weight = weight;
      if (height) updatedUserData.height = height;
      if (lastname) updatedUserData.lastname = lastname;
  
      const updatedUser = await strapi
        .plugins['users-permissions']
        .services.user.edit( id , updatedUserData);

      // Keep manyToMany membership in sync when active club is assigned.
      if (club) {
        const clubId =
          typeof club === 'object' ? club.id || club.connect?.[0]?.id : club;
        if (clubId) {
          try {
            await strapi.db.query(USER_UID).update({
              where: { id },
              data: {
                clubs: {
                  connect: [{ id: Number(clubId) }],
                },
              },
            });
          } catch (syncError) {
            console.error('Failed to sync clubs membership', syncError);
          }
        }
      }

      const refreshedUser = await strapi.db.query(USER_UID).findOne({
        where: { id },
        populate: { club: true, clubs: true, role: true, avatar: true },
      });

      const sanitizedUser = {
        id: refreshedUser.id,
        email: refreshedUser.email,
        club: refreshedUser.club,
        clubs: refreshedUser.clubs,
        birthdate: refreshedUser.birthdate,
        avatar: refreshedUser.avatar,
        weight: refreshedUser.weight,
        height: refreshedUser.height,
        lastname: refreshedUser.lastname,
        name: refreshedUser.name,
        role: refreshedUser.role,
      };
  
      return ctx.send(sanitizedUser);
    } catch (error) {
      console.error(error);
      return ctx.internalServerError('Error updating user');
    }
  },
  async delete(ctx) {
    const { id } = ctx.params;

    try {
      // Verificamos que el usuario exista
      const existingUser = await strapi
        .query('plugin::users-permissions.user')
        .findOne({ where: { id } });

      if (!existingUser) {
        return ctx.notFound('User not found');
      }

      // Eliminar el usuario usando entityService
      await strapi.entityService.delete('plugin::users-permissions.user', id);

      return ctx.send({ message: 'User deleted successfully' });
    } catch (error) {
      console.error(error);
      return ctx.internalServerError('Error deleting user');
    }
  },

  async appSetActiveClub(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized('Authentication required');

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const result = await setActiveClubForUser(strapi, authUser.id, payload.clubId);

    if (result.error === 'unauthorized') return ctx.unauthorized(result.message);
    if (result.error === 'forbidden') return ctx.forbidden(result.message);
    if (result.error === 'notFound') return ctx.notFound(result.message);
    if (result.error) return ctx.badRequest(result.message);

    return ctx.send({
      data: {
        ...formatUserClubs(result.user),
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        lastname: result.user.lastname,
        role: result.user.role,
        avatar: result.user.avatar,
      },
    });
  },

  async appAddClub(ctx) {
    const authUser = ctx.state.user;
    if (!authUser) return ctx.unauthorized('Authentication required');

    const payload = ctx.request.body?.data || ctx.request.body || {};
    const result = await addClubMembershipForUser(strapi, authUser.id, payload.clubId, {
      setActive: Boolean(payload.setActive),
    });

    if (result.error === 'unauthorized') return ctx.unauthorized(result.message);
    if (result.error === 'forbidden') return ctx.forbidden(result.message);
    if (result.error === 'notFound') return ctx.notFound(result.message);
    if (result.error) return ctx.badRequest(result.message);

    return ctx.send({
      data: {
        ...formatUserClubs(result.user),
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        lastname: result.user.lastname,
        role: result.user.role,
        avatar: result.user.avatar,
      },
    });
  },
  
};
