package com.splitmate.project.dto;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.Set;

import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

@Documented
@Constraint(validatedBy = RoundingUnit.Validator.class)
@Target(ElementType.FIELD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RoundingUnit {

    String message() default "Rounding unit must be one of 1, 10, 100, or 1000.";

    Class<?>[] groups() default {};

    Class<? extends Payload>[] payload() default {};

    final class Validator implements ConstraintValidator<RoundingUnit, Integer> {

        private static final Set<Integer> ALLOWED_VALUES = Set.of(1, 10, 100, 1000);

        @Override
        public boolean isValid(Integer value, ConstraintValidatorContext context) {
            return value == null || ALLOWED_VALUES.contains(value);
        }
    }
}
