'use strict';

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

        const sanitizedUser = {
          id: user.id,
          email: user.email,
          club: user.club,
          birthdate: user.birthdate,
          avatar: user.avatar,
          weight: user.weight,
          height: user.height,
          lastname: user.lastname,
          name: user.name,
          role: user.role,
          username:user.username
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
      if (avatar) updatedUserData.avatar = avatar;
      if (club) updatedUserData.club = club;
      if (weight) updatedUserData.weight = weight;
      if (height) updatedUserData.height = height;
      if (lastname) updatedUserData.lastname = lastname;
  
      const updatedUser = await strapi
        .plugins['users-permissions']
        .services.user.edit( id , updatedUserData);
      const sanitizedUser = {
        id: updatedUser.id,
        email: updatedUser.email,
        club: updatedUser.club,
        birthdate: updatedUser.birthdate,
        avatar: updatedUser.avatar,
        weight: updatedUser.weight,
        height: updatedUser.height,
        lastname: updatedUser.lastname,
        name: updatedUser.name,
        role: updatedUser.role,
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
  }
  
};
